const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Explicit opt-in. Never fall back to the application's DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL;

test("PostgreSQL POS concurrency", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
    assert.match(new URL(databaseUrl).pathname, /_test$/, "Use a dedicated database whose name ends in _test");
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    const { InventoryService } = require("../dist/modules/inventory/services/inventory.service");
    const { InventoryRepository } = require("../dist/modules/inventory/repositories/inventory.repository");
    const { SalesService } = require("../dist/modules/sales/services/sales.service");
    const { TransfersService } = require("../dist/modules/transfers/services/transfers.service");
    const { assertStoreWritableInTransaction } = require("../dist/core/services/billing-state.service");
    const { lockStore } = require("../dist/core/services/store-lock.service");
    const storeIds = [];
    const planId = randomUUID();
    let capturedQueries = null;
    prisma.$on("query", (event) => capturedQueries?.push(event.query));

    async function fixture() {
        const store = await prisma.store.create({ data: {
            name: "Concurrency fixture", slug: `test-${randomUUID()}`, status: "ACTIVE", planId,
            trialEndsAt: new Date(Date.now() + 86400000),
            subscription: { create: { planId, status: "ACTIVE", trialEndsAt: new Date(Date.now() + 86400000), currentPeriodEnd: new Date(Date.now() + 86400000) } },
        } });
        storeIds.push(store.id);
        const branch = await prisma.branch.create({ data: { storeId: store.id, name: "Source" } });
        const destination = await prisma.branch.create({ data: { storeId: store.id, name: "Destination" } });
        const user = await prisma.user.create({ data: {
            storeId: store.id, branchId: branch.id, username: `test_${randomUUID()}`,
            fullName: "Test cashier", password: "test fixture has no login password", role: "STORE_OWNER",
        } });
        return { storeId: store.id, branchId: branch.id, destinationId: destination.id,
            user: { id: user.id, storeId: store.id, branchId: branch.id, role: "STORE_OWNER", authVersion: 0 } };
    }

    async function product(f, stock = 0) {
        const p = await prisma.product.create({ data: {
            storeId: f.storeId, name: `Product ${randomUUID()}`, unit: "KG", costPriceUzs: 50,
            retailPriceUzs: 100, wholesalePriceUzs: 80, lowStockThreshold: 2,
        } });
        if (stock) await InventoryService.stockIn({ branchId: f.branchId, productId: p.id, quantity: stock, costPriceUzs: 50 }, f.user);
        return p;
    }

    const checkout = (f, p, quantity = 1, extra = {}) => ({
        branchId: f.branchId, saleType: "RETAIL", paymentMethod: "CASH_UZS",
        items: [{ productId: p.id, quantity }], paidAmountUzs: quantity * 100, paidAmountUsd: 0, ...extra,
    });

    async function assertStock(f, p, expected, branchId = f.branchId) {
        const inv = await prisma.inventory.findUnique({ where: { branchId_productId: { branchId, productId: p.id } } });
        const batches = await prisma.stockBatch.aggregate({ where: { storeId: f.storeId, branchId, productId: p.id }, _sum: { remainingQty: true } });
        assert.equal(Number(inv?.quantity ?? 0), expected);
        assert.equal(Number(batches._sum.remainingQty ?? 0), expected);
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: `TEST_${randomUUID()}`, name: "Concurrency tests" } });
        const f = await fixture();
        const other = await fixture();

        await t.test("eight cashiers competing for the last item yield exactly one sale", async () => {
            const p = await product(f, 1);
            const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => SalesService.create(checkout(f, p), f.user)));
            assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
            for (const result of outcomes.filter((r) => r.status === "rejected")) assert.equal(result.reason.statusCode, 409);
            await assertStock(f, p, 0);
            assert.equal(await prisma.saleItem.count({ where: { productId: p.id } }), 1);
        });

        await t.test("checkout retries share one persistent result; mismatched input conflicts", async () => {
            const p = await product(f, 10);
            const key = randomUUID();
            const results = await Promise.all(Array.from({ length: 6 }, () => SalesService.create(checkout(f, p), f.user, key)));
            assert.equal(new Set(results.map((sale) => sale.id)).size, 1);
            await assertStock(f, p, 9);
            await assert.rejects(() => SalesService.create(checkout(f, p, 2), f.user, key), (e) => e.statusCode === 409);
        });

        await t.test("failed checkout rolls back all stock and its retry claim", async () => {
            const stocked = await product(f, 2);
            const empty = await product(f);
            const key = randomUUID();
            const input = checkout(f, stocked, 1, { items: [{ productId: stocked.id, quantity: 1 }, { productId: empty.id, quantity: 1 }], paidAmountUzs: 200 });
            await assert.rejects(() => SalesService.create(input, f.user, key), (e) => e.statusCode === 409);
            await assertStock(f, stocked, 2);
            assert.equal(await prisma.idempotencyRecord.count({ where: { storeId: f.storeId, key } }), 0);
            await InventoryService.stockIn({ branchId: f.branchId, productId: empty.id, quantity: 1, costPriceUzs: 50 }, f.user);
            await SalesService.create(input, f.user, key);
            await assertStock(f, empty, 0);
        });

        await t.test("fractional FIFO consumes oldest batches without floating-point shortage", async () => {
            const p = await product(f);
            const first = await InventoryService.stockIn({ branchId: f.branchId, productId: p.id, quantity: 0.1, costPriceUzs: 50 }, f.user);
            await prisma.stockBatch.update({ where: { id: first.id }, data: { receivedAt: new Date("2020-01-01") } });
            const second = await InventoryService.stockIn({ branchId: f.branchId, productId: p.id, quantity: 0.2, costPriceUzs: 60 }, f.user);
            await SalesService.create(checkout(f, p, 0.15), f.user);
            assert.equal(Number((await prisma.stockBatch.findUnique({ where: { id: first.id } })).remainingQty), 0);
            assert.equal(Number((await prisma.stockBatch.findUnique({ where: { id: second.id } })).remainingQty), 0.15);
            await SalesService.create(checkout(f, p, 0.15), f.user);
            await assertStock(f, p, 0);
        });

        await t.test("concurrent debt collections and retried payments preserve sale/customer balances", async () => {
            const p = await product(f, 1);
            const customer = await prisma.customer.create({ data: { storeId: f.storeId, branchId: f.branchId, fullName: "Debtor" } });
            const sale = await SalesService.create(checkout(f, p, 1, { customerId: customer.id, paidAmountUzs: 0, paymentMethod: "CREDIT" }), f.user);
            const input = { amountUzs: 5, amountUsd: 0, paymentMethod: "CASH_UZS" };
            await Promise.all(Array.from({ length: 6 }, () => SalesService.addPayment(sale.id, input, f.user, randomUUID())));
            const key = randomUUID();
            await Promise.all(Array.from({ length: 6 }, () => SalesService.addPayment(sale.id, input, f.user, key)));
            const updated = await prisma.sale.findUnique({ where: { id: sale.id }, include: { customer: true, payments: true } });
            assert.equal(Number(updated.paidAmountUzs), 35);
            assert.equal(Number(updated.debtAmountUzs), 65);
            assert.equal(Number(updated.customer.balance), 65);
            assert.equal(updated.payments.length, 7);
            await assert.rejects(() => SalesService.addPayment(sale.id, input, { ...f.user, role: "CASHIER", branchId: f.destinationId }, key), (e) => [403, 409].includes(e.statusCode));
        });

        await t.test("adjustment and sale races keep both ledgers consistent; retried adjustment does not reset later stock", async () => {
            const p = await product(f, 10);
            const key = randomUUID();
            const input = { branchId: f.branchId, productId: p.id, newQuantity: 5, reason: "Physical count" };
            const [adjusted] = await Promise.all([InventoryService.adjust(input, f.user, key), SalesService.create(checkout(f, p), f.user)]);
            const inv = await prisma.inventory.findUnique({ where: { branchId_productId: { branchId: f.branchId, productId: p.id } } });
            assert.ok([4, 5].includes(Number(inv.quantity)));
            await assertStock(f, p, Number(inv.quantity));
            const replay = await InventoryService.adjust(input, f.user, key);
            assert.equal(replay.movement.id, adjusted.movement.id);
            await assertStock(f, p, Number(inv.quantity));
            await InventoryService.adjust({ ...input, newQuantity: 8 }, f.user);
            await SalesService.create(checkout(f, p, 8), f.user);
            await assertStock(f, p, 0);
        });

        await t.test("simultaneous stock receipts, including first inventory creation, do not lose increments", async () => {
            const p = await product(f);
            const input = { branchId: f.branchId, productId: p.id, quantity: 1, costPriceUzs: 50 };
            await Promise.all(Array.from({ length: 6 }, () => InventoryService.stockIn(input, f.user)));
            const key = randomUUID();
            await Promise.all(Array.from({ length: 4 }, () => InventoryService.stockInBatch([input, input], f.user, key)));
            await assertStock(f, p, 8);
        });

        await t.test("transfer completes once and completion/cancellation races cannot contradict stock", async () => {
            const p = await product(f, 10);
            const receiver = { ...f.user, branchId: f.destinationId, role: "BRANCH_ADMIN" };
            const input = { fromBranchId: f.branchId, toBranchId: f.destinationId, items: [{ productId: p.id, quantity: 2 }] };
            const transfer = await TransfersService.create(input, f.user);
            const results = await Promise.allSettled(Array.from({ length: 6 }, () => TransfersService.complete(transfer.id, receiver)));
            assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
            await assertStock(f, p, 8);
            await assertStock(f, p, 2, f.destinationId);
            const next = await TransfersService.create(input, f.user);
            const race = await Promise.allSettled([TransfersService.complete(next.id, receiver), TransfersService.cancel(next.id, f.user)]);
            assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
            const status = (await prisma.transfer.findUnique({ where: { id: next.id } })).status;
            await assertStock(f, p, status === "COMPLETED" ? 6 : 8);
            await assertStock(f, p, status === "COMPLETED" ? 4 : 2, f.destinationId);
        });

        await t.test("opposite transfers acquire inventory locks in the same order", async () => {
            const p = await product(f, 10);
            await InventoryService.stockIn({ branchId: f.destinationId, productId: p.id, quantity: 10, costPriceUzs: 50 }, f.user);
            const forward = await TransfersService.create({ fromBranchId: f.branchId, toBranchId: f.destinationId, items: [{ productId: p.id, quantity: 1 }] }, f.user);
            const backward = await TransfersService.create({ fromBranchId: f.destinationId, toBranchId: f.branchId, items: [{ productId: p.id, quantity: 1 }] }, f.user);
            await Promise.all([
                TransfersService.complete(forward.id, { ...f.user, role: "BRANCH_ADMIN", branchId: f.destinationId }),
                TransfersService.complete(backward.id, { ...f.user, role: "BRANCH_ADMIN" }),
            ]);
            await assertStock(f, p, 10);
            await assertStock(f, p, 10, f.destinationId);
        });

        await t.test("tenant and branch boundaries survive batching and low-stock filtering", async () => {
            const p = await product(other, 1);
            await assert.rejects(() => SalesService.create(checkout(f, p), f.user), (e) => e.statusCode === 404);
            await assertStock(other, p, 1);
            const rows = await InventoryRepository.findAll({ storeId: f.storeId, lowStock: true, limit: 1, offset: 0 });
            assert.ok(rows.length <= 1);
            for (const row of rows) { assert.notEqual(row.product.id, p.id); assert.ok(Number(row.quantity) <= Number(row.product.lowStockThreshold)); }
        });

        await t.test("shared POS billing guards overlap while lifecycle changes wait for them", async () => {
            let release;
            let entered;
            const gate = new Promise((resolve) => { release = resolve; });
            const ready = new Promise((resolve) => { entered = resolve; });
            const first = prisma.$transaction(async (tx) => { await assertStoreWritableInTransaction(tx, f.storeId, "shared"); entered(); await gate; });
            await ready;
            try {
                await prisma.$transaction((tx) => assertStoreWritableInTransaction(tx, f.storeId, "shared"), { timeout: 1000 });
                await assert.rejects(() => prisma.$transaction(async (tx) => {
                    await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
                    await lockStore(tx, f.storeId);
                }));
            } finally { release(); await first; }
        });

        await t.test("checkout updates FIFO once for twenty products, and summaries match scoped SQL", async () => {
            const products = [];
            for (let index = 0; index < 20; index++) products.push(await product(f, 1));
            capturedQueries = [];
            await SalesService.create(checkout(f, products[0], 1, { items: products.map((p) => ({ productId: p.id, quantity: 1 })), paidAmountUzs: 2000 }), f.user);
            const queries = capturedQueries;
            capturedQueries = null;
            assert.equal(queries.filter((query) => query.includes('UPDATE "StockBatch"')).length, 1);
            const summary = await InventoryRepository.batchesSummary(f.storeId, f.branchId);
            assert.equal(summary.totalBatches, await prisma.stockBatch.count({ where: { storeId: f.storeId, branchId: f.branchId } }));
        });

        await t.test("pool acquisition exhaustion produces a retryable response", async () => {
            const { PrismaClient } = require("@prisma/client");
            const { PrismaPg } = require("@prisma/adapter-pg");
            const { errorHandler } = require("../dist/core/errors/errorHandler");
            // A deliberately small, test-only pool exercises the driver's real error shape.
            const limited = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 100 }) });
            let release;
            let entered;
            const gate = new Promise((resolve) => { release = resolve; });
            const ready = new Promise((resolve) => { entered = resolve; });
            const holder = limited.$transaction(async (tx) => { await tx.$queryRaw`SELECT 1`; entered(); await gate; });
            await ready;
            try {
                let failure;
                try { await limited.user.count(); } catch (error) { failure = error; }
                assert.ok(failure, "Pool acquisition should time out");
                const res = { headersSent: false, statusCode: 200, setHeader() {},
                    status(value) { this.statusCode = value; return this; }, json() { return this; } };
                errorHandler(failure, {}, res, () => assert.fail("unexpected next"));
                assert.equal(res.statusCode, 503, `${failure.name}: ${failure.code ?? "no code"}`);
            } finally { release(); await holder; await limited.$disconnect(); }
        });
    } finally {
        capturedQueries = null;
        // Only IDs allocated by this test are removed; no reset/truncate.
        if (storeIds.length) {
            const storeScope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
                await tx.salePayment.deleteMany({ where: { sale: storeScope } });
                await tx.saleItem.deleteMany({ where: { sale: storeScope } });
                await tx.sale.deleteMany({ where: storeScope });
                await tx.transferItem.deleteMany({ where: { transfer: storeScope } });
                await tx.transfer.deleteMany({ where: storeScope });
                await tx.stockMovement.deleteMany({ where: storeScope });
                await tx.stockBatch.deleteMany({ where: storeScope });
                await tx.inventory.deleteMany({ where: storeScope });
                await tx.customer.deleteMany({ where: storeScope });
                await tx.product.deleteMany({ where: storeScope });
                await tx.user.deleteMany({ where: storeScope });
                await tx.branch.deleteMany({ where: storeScope });
                await tx.subscription.deleteMany({ where: storeScope });
                await tx.store.deleteMany({ where: { id: { in: storeIds } } });
            });
        }
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.$disconnect();
    }
});
