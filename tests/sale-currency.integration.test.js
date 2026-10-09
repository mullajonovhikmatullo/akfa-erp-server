const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Explicit opt-in. Never fall back to the application's DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL;

test("Mixed UZS/USD cart settles in whole so'm", { skip: !databaseUrl, timeout: 60000 }, async (t) => {
    assert.match(new URL(databaseUrl).pathname, /_test$/, "Use a dedicated database whose name ends in _test");
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    const { InventoryService } = require("../dist/modules/inventory/services/inventory.service");
    const { SalesService } = require("../dist/modules/sales/services/sales.service");
    const planId = randomUUID();
    let storeId;

    try {
        await prisma.plan.create({ data: { id: planId, code: `TEST_${randomUUID()}`, name: "Currency tests" } });
        const store = await prisma.store.create({ data: {
            name: "Currency fixture", slug: `test-${randomUUID()}`, status: "ACTIVE", planId,
            trialEndsAt: new Date(Date.now() + 86400000),
            subscription: { create: { planId, status: "ACTIVE", trialEndsAt: new Date(Date.now() + 86400000), currentPeriodEnd: new Date(Date.now() + 86400000) } },
        } });
        storeId = store.id;
        const branch = await prisma.branch.create({ data: { storeId, name: "Main" } });
        const owner = await prisma.user.create({ data: {
            storeId, branchId: branch.id, username: `test_${randomUUID()}`,
            fullName: "Test cashier", password: "test fixture has no login password", role: "STORE_OWNER",
        } });
        const user = { id: owner.id, storeId, branchId: branch.id, role: "STORE_OWNER", authVersion: 0 };
        const customer = await prisma.customer.create({ data: {
            storeId, branchId: branch.id, fullName: "Debtor",
        } });
        await prisma.customerBranch.create({ data: { storeId, customerId: customer.id, branchId: branch.id } });

        async function product(prices, unit = "PIECE") {
            const p = await prisma.product.create({ data: {
                storeId, name: `Product ${randomUUID()}`, unit, costPriceUzs: 1, wholesalePriceUzs: 1, ...prices,
            } });
            await InventoryService.stockIn({ branchId: branch.id, productId: p.id, quantity: 100, costPriceUzs: 1 }, user);
            return p;
        }

        const rate = 12685.5;
        await prisma.store.update({ where: { id: storeId }, data: { usdRateMode: "MANUAL", manualUsdToUzsRate: rate } });
        const uzs = await product({ retailPriceUzs: 1225000 });
        const usd = await product({ retailPriceUzs: 0, retailPriceUsd: 215.37 });
        const usdKg = await product({ retailPriceUzs: 0, retailPriceUsd: 3.33 }, "KG");
        const items = [
            { productId: uzs.id, quantity: 2 },
            { productId: usd.id, quantity: 2 },
            { productId: usdKg.id, quantity: 1.2345 },
        ];
        const usdUnit = Math.round(215.37 * rate);
        const kgUnit = Math.round(3.33 * rate);
        const expectedTotal = 2 * 1225000 + 2 * usdUnit + Math.round(1.2345 * kgUnit);
        const base = { branchId: branch.id, saleType: "RETAIL", paymentMethod: "CASH_UZS", usdToUzsRate: rate, items };

        await t.test("full payment of the shown total leaves no debt", async () => {
            const sale = await SalesService.create({ ...base, paidAmountUzs: expectedTotal, paidAmountUsd: 0 }, user);
            assert.equal(Number(sale.totalAmountUzs), expectedTotal);
            assert.equal(Number(sale.debtAmountUzs), 0);
            for (const item of sale.items) {
                assert.equal(Number(item.totalPrice), Math.round(Number(item.totalPrice)));
            }
        });

        await t.test("a sale priced at a stale client rate is rejected", async () => {
            await assert.rejects(
                SalesService.create({ ...base, usdToUzsRate: 12000, paidAmountUzs: expectedTotal, paidAmountUsd: 0 }, user),
                (error) => error.statusCode === 409,
            );
            await assert.rejects(
                SalesService.create({ ...base, usdToUzsRate: undefined, paidAmountUzs: expectedTotal, paidAmountUsd: 0 }, user),
                (error) => error.statusCode === 400,
            );
        });

        await t.test("partial payment debt is a whole so'm amount and can be paid off exactly", async () => {
            const sale = await SalesService.create({ ...base, customerId: customer.id, paidAmountUzs: 1000000, paidAmountUsd: 0 }, user);
            const debt = Number(sale.debtAmountUzs);
            assert.equal(debt, expectedTotal - 1000000);
            const paid = await SalesService.addPayment(sale.id, { amountUzs: debt, amountUsd: 0, paymentMethod: "CARD" }, user);
            assert.equal(Number(paid.debtAmountUzs), 0);
            const balance = await prisma.customer.findUnique({ where: { id: customer.id }, select: { balance: true } });
            assert.equal(Number(balance.balance), 0);
        });
    } finally {
        if (storeId) {
            for (const table of ["SalePayment", "SaleItem", "StockMovement", "Sale", "StockBatch", "Inventory", "IdempotencyRecord", "CustomerBranch", "Customer", "Product", "User", "Branch", "Subscription"]) {
                await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "storeId" = $1`, storeId).catch(() => {});
            }
            await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
        }
        await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
        await prisma.$disconnect();
    }
});
