const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("branch debt attribution, customer privacy and tenant foreign keys", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
    assert.match(new URL(databaseUrl).pathname, /_test$/);
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    process.env.REGISTRATION_RATE_LIMIT_MAX = "100";
    process.env.LOGIN_RATE_LIMIT_MAX = "100";
    process.env.STORAGE_PROVIDER = "local";

    const express = require("express");
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    const { errorHandler } = require("../dist/core/errors/errorHandler");
    const app = express();
    app.use(express.json());
    const router = express.Router();
    for (const name of ["auth", "admins", "branches", "products", "customers", "sales", "expenses", "inventory", "transfers", "analytics"]) {
        router.use(`/${name}`, require(`../dist/modules/${name}/${name}.routes`).default);
    }
    router.use("/public", require("../dist/modules/onboarding/onboarding.routes").default);
    app.use("/api", router);
    app.use(errorHandler);
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const planId = randomUUID();
    const storeIds = [];

    async function request(token, path, method = "GET", body, expected = 200) {
        const response = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        const data = await response.json().catch(() => null);
        assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
        return data?.data ?? data;
    }

    async function register(label) {
        const username = `branch_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, storeId: registered.store.id, mainBranchId: session.user.branchId, userId: session.user.id };
    }

    async function branchAdmin(owner, branchId) {
        const username = `admin_${randomBytes(5).toString("hex")}`;
        await request(owner.token, "/api/admins", "POST", { fullName: "Branch admin", username, password: "secret123", branchId }, 201);
        return (await request(null, "/api/auth/login", "POST", { username, password: "secret123" })).accessToken;
    }

    const planCode = `B${randomBytes(5).toString("hex").toUpperCase()}`;
    const report = "?from=2020-01-01&to=2099-01-01";

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Branch isolation", isPublic: true, maxUsers: 10, maxBranches: 10, monthlyPriceUzs: 100 } });
        const owner = await register("Branch owner");
        const branchA = await request(owner.token, "/api/branches", "POST", { name: "Filial A" }, 201);
        const branchB = await request(owner.token, "/api/branches", "POST", { name: "Filial B" }, 201);
        const A = await branchAdmin(owner, branchA.id);
        const B = await branchAdmin(owner, branchB.id);
        const product = await request(owner.token, "/api/products", "POST", {
            name: "Shared product", unit: "PIECE", costPriceUzs: 10, retailPriceUzs: 100, wholesalePriceUzs: 50,
        }, 201);
        for (const branchId of [branchA.id, branchB.id]) {
            await request(owner.token, "/api/inventory/stock-in", "POST", { branchId, productId: product.id, quantity: 50, costPriceUzs: 10 }, 201);
        }
        const creditSale = (token, customerId) => request(token, "/api/sales", "POST", {
            items: [{ productId: product.id, quantity: 1 }], saleType: "RETAIL", paidAmountUzs: 0, paymentMethod: "CREDIT", customerId,
        }, 201);

        // Registered in A with a 30 UZS opening debt, then buys 100 UZS on credit in B only.
        const customer = await request(A, "/api/customers", "POST", { fullName: "Shared customer", phone: "+998907770011", balance: 30 }, 201);
        await request(B, `/api/customers/${customer.id}/branches`, "POST", {});
        const saleB = await creditSale(B, customer.id);

        await t.test("analytics attribute customer debt to the branch where it was created", async () => {
            const [dashA, dashB, dashStore, debtA, debtB, debtStore] = await Promise.all([
                request(A, `/api/analytics/dashboard${report}`),
                request(B, `/api/analytics/dashboard${report}`),
                request(owner.token, `/api/analytics/dashboard${report}`),
                request(A, `/api/analytics/customers/debt${report}`),
                request(B, `/api/analytics/customers/debt${report}`),
                request(owner.token, `/api/analytics/customers/debt${report}`),
            ]);
            assert.deepEqual(dashA.customers, { totalDebt: 30, debtorCount: 1 });
            assert.deepEqual(dashB.customers, { totalDebt: 100, debtorCount: 1 });
            assert.deepEqual(dashStore.customers, { totalDebt: 130, debtorCount: 1 });
            assert.deepEqual(debtA.summary, { totalDebt: 30, debtorCount: 1 });
            assert.deepEqual(debtB.summary, { totalDebt: 100, debtorCount: 1 });
            assert.deepEqual(debtStore.summary, { totalDebt: 130, debtorCount: 1 });
            assert.equal(debtB.topDebtors[0].balance, 100);
            assert.deepEqual(debtB.topDebtors[0].branch, { id: branchB.id, name: branchB.name });
            assert.equal(debtStore.topDebtors[0].balance, 130);

            const ownerB = await request(owner.token, `/api/analytics/customers/debt${report}&branchId=${branchB.id}`);
            assert.deepEqual(ownerB.summary, { totalDebt: 100, debtorCount: 1 });
        });

        await t.test("branch staff see only their own branch's share of a customer balance", async () => {
            const [detailA, detailB, detailOwner] = await Promise.all([
                request(A, `/api/customers/${customer.id}`),
                request(B, `/api/customers/${customer.id}`),
                request(owner.token, `/api/customers/${customer.id}`),
            ]);
            assert.equal(Number(detailA.balance), 30);
            assert.equal(detailA.recentSales.length, 0);
            assert.equal(Number(detailB.balance), 100);
            assert.equal(detailB.recentSales.length, 1);
            assert.equal(Number(detailOwner.balance), 130);

            const listB = await request(B, "/api/customers?hasDebt=true");
            assert.deepEqual(listB.map((c) => [c.id, Number(c.balance)]), [[customer.id, 100]]);

            const paid = await request(B, `/api/sales/${saleB.id}/payments`, "POST", { amountUzs: 100, paymentMethod: "CASH_UZS" });
            assert.equal(Number(paid.debtAmountUzs), 0);
            assert.deepEqual(await request(B, "/api/customers?hasDebt=true"), []);
            assert.equal(Number((await request(A, `/api/customers/${customer.id}`)).balance), 30);
            assert.equal(Number((await request(owner.token, `/api/customers/${customer.id}`)).balance), 30);
            assert.deepEqual((await request(B, `/api/analytics/dashboard${report}`)).customers, { totalDebt: 0, debtorCount: 0 });
        });

        await t.test("phone check reveals only identity fields for a customer outside the branch", async () => {
            const onlyB = await request(B, "/api/customers", "POST", { fullName: "Only B", phone: "+998907770022", address: "Secret street" }, 201);
            await creditSale(B, onlyB.id);
            const phone = encodeURIComponent("+998907770022");

            const fromA = await request(A, `/api/customers/check-phone?phone=${phone}`);
            assert.equal(fromA.linkedToBranch, false);
            assert.deepEqual(Object.keys(fromA.customer).sort(), ["branch", "fullName", "id", "phone"]);
            await request(A, `/api/customers/${onlyB.id}`, "GET", undefined, 403);

            const fromB = await request(B, `/api/customers/check-phone?phone=${phone}`);
            assert.equal(fromB.linkedToBranch, true);
            assert.equal(Number(fromB.customer.balance), 100);

            const fromOwner = await request(owner.token, `/api/customers/check-phone?phone=${phone}&branchId=${branchA.id}`);
            assert.equal(fromOwner.customer.address, "Secret street");
            assert.equal(Number(fromOwner.customer.balance), 100);

            const linked = await request(A, `/api/customers/${onlyB.id}/branches`, "POST", {});
            assert.equal(Number(linked.balance), 0);
            const link = await prisma.customerBranch.findUnique({ where: { customerId_branchId: { customerId: onlyB.id, branchId: branchA.id } } });
            assert.equal(link.storeId, owner.storeId);
        });

        await t.test("child rows created by the API carry their parent's store", async () => {
            const transfer = await request(A, "/api/transfers", "POST", { toBranchId: branchB.id, items: [{ productId: product.id, quantity: 1 }] }, 201);
            const [saleItems, salePayments, transferItems, allocations] = await Promise.all([
                prisma.saleItem.findMany({ where: { saleId: saleB.id } }),
                prisma.salePayment.findMany({ where: { saleId: saleB.id } }),
                prisma.transferItem.findMany({ where: { transferId: transfer.id } }),
                prisma.transferAllocation.findMany({ where: { transferItem: { transferId: transfer.id } } }),
            ]);
            for (const row of [...saleItems, ...salePayments, ...transferItems, ...allocations]) assert.equal(row.storeId, owner.storeId);
            assert.equal(allocations.length, 1);
        });

        await t.test("the database rejects every cross-store reference", async () => {
            const other = await register("Other store");
            const otherProduct = await prisma.product.create({ data: { storeId: other.storeId, name: "Foreign", unit: "PIECE", retailPriceUzs: 1, wholesalePriceUzs: 1 } });
            const otherCategory = await prisma.expenseCategory.create({ data: { storeId: other.storeId, name: "Foreign" } });
            const otherProductCategory = await prisma.productCategory.create({ data: { storeId: other.storeId, name: "Foreign" } });
            const otherCustomer = await prisma.customer.create({ data: { storeId: other.storeId, branchId: other.mainBranchId, fullName: "Foreign" } });
            const otherSubscription = await prisma.subscription.findUniqueOrThrow({ where: { storeId: other.storeId } });
            const otherBatch = await prisma.stockBatch.create({ data: {
                storeId: other.storeId, branchId: other.mainBranchId, productId: otherProduct.id,
                initialQty: 1, remainingQty: 1, costPriceUzs: 1, createdById: other.userId,
            } });
            const ownSale = await prisma.sale.findUniqueOrThrow({ where: { id: saleB.id } });
            const ownTransferItem = await prisma.transferItem.findFirstOrThrow({ where: { storeId: owner.storeId } });

            const s = owner.storeId;
            const own = { storeId: s, branchId: branchA.id, createdById: owner.userId };
            const attempts = {
                "Product.category": () => prisma.product.create({ data: { storeId: s, name: "X", unit: "PIECE", retailPriceUzs: 1, wholesalePriceUzs: 1, categoryId: otherProductCategory.id } }),
                "Inventory.branch": () => prisma.inventory.create({ data: { storeId: s, branchId: other.mainBranchId, productId: product.id } }),
                "Inventory.product": () => prisma.inventory.create({ data: { storeId: s, branchId: branchB.id, productId: otherProduct.id } }),
                "StockBatch.product": () => prisma.stockBatch.create({ data: { ...own, productId: otherProduct.id, initialQty: 1, remainingQty: 1, costPriceUzs: 1 } }),
                "StockBatch.createdBy": () => prisma.stockBatch.create({ data: { ...own, productId: product.id, initialQty: 1, remainingQty: 1, costPriceUzs: 1, createdById: other.userId } }),
                "StockMovement.branch": () => prisma.stockMovement.create({ data: { ...own, branchId: other.mainBranchId, productId: product.id, type: "ADJUSTMENT", quantity: 1, balanceAfter: 1 } }),
                "Customer.branch": () => prisma.customer.create({ data: { storeId: s, branchId: other.mainBranchId, fullName: "X" } }),
                "CustomerBranch.branch": () => prisma.customerBranch.create({ data: { storeId: s, customerId: customer.id, branchId: other.mainBranchId } }),
                "CustomerBranch.customer": () => prisma.customerBranch.create({ data: { storeId: s, customerId: otherCustomer.id, branchId: branchA.id } }),
                "Sale.branch": () => prisma.sale.create({ data: { storeId: s, branchId: other.mainBranchId, soldById: owner.userId, saleType: "RETAIL", totalAmountUzs: 1 } }),
                "Sale.customer": () => prisma.sale.create({ data: { storeId: s, branchId: branchA.id, customerId: otherCustomer.id, soldById: owner.userId, saleType: "RETAIL", totalAmountUzs: 1 } }),
                "Sale.soldBy": () => prisma.sale.create({ data: { storeId: s, branchId: branchA.id, soldById: other.userId, saleType: "RETAIL", totalAmountUzs: 1 } }),
                "SaleItem.product": () => prisma.saleItem.create({ data: { storeId: s, saleId: ownSale.id, productId: otherProduct.id, quantity: 1, unitPrice: 1, totalPrice: 1 } }),
                "SaleItem.sale": () => prisma.saleItem.create({ data: { storeId: other.storeId, saleId: ownSale.id, productId: otherProduct.id, quantity: 1, unitPrice: 1, totalPrice: 1 } }),
                "SalePayment.receivedBy": () => prisma.salePayment.create({ data: { storeId: s, saleId: ownSale.id, paymentMethod: "CASH_UZS", receivedById: other.userId } }),
                "Expense.category": () => prisma.expense.create({ data: { ...own, categoryId: otherCategory.id, amount: 1, expenseDate: new Date() } }),
                "Transfer.toBranch": () => prisma.transfer.create({ data: { storeId: s, fromBranchId: branchA.id, toBranchId: other.mainBranchId, initiatedById: owner.userId } }),
                "Transfer.initiatedBy": () => prisma.transfer.create({ data: { storeId: s, fromBranchId: branchA.id, toBranchId: branchB.id, initiatedById: other.userId } }),
                "TransferItem.product": () => prisma.transferItem.create({ data: { storeId: s, transferId: ownTransferItem.transferId, productId: otherProduct.id, quantity: 1, unitCostUzs: 1, totalCostUzs: 1 } }),
                "TransferAllocation.stockBatch": () => prisma.transferAllocation.create({ data: { storeId: s, transferItemId: ownTransferItem.id, stockBatchId: otherBatch.id, quantity: 1 } }),
                "Payment.subscription": () => prisma.payment.create({ data: { storeId: s, subscriptionId: otherSubscription.id, amount: 1 } }),
                "Payment.branch": () => prisma.payment.create({ data: { storeId: s, branchId: other.mainBranchId, amount: 1 } }),
            };
            for (const [name, attempt] of Object.entries(attempts)) {
                await assert.rejects(attempt, (error) => error.code === "P2003", `${name} must be rejected`);
            }
        });

        await t.test("deleting a branch still nulls optional references", async () => {
            const spare = await request(owner.token, "/api/branches", "POST", { name: "Spare" }, 201);
            const payment = await prisma.payment.create({ data: { storeId: owner.storeId, branchId: spare.id, amount: 1 } });
            await request(owner.token, `/api/branches/${spare.id}`, "DELETE");
            assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).branchId, null);
        });
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (storeIds.length) {
            const scope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
                await tx.salePayment.deleteMany({ where: scope });
                await tx.saleItem.deleteMany({ where: scope });
                await tx.sale.deleteMany({ where: scope });
                await tx.expense.deleteMany({ where: scope });
                await tx.expenseCategory.deleteMany({ where: scope });
                await tx.transferItem.deleteMany({ where: scope });
                await tx.transfer.deleteMany({ where: scope });
                await tx.payment.deleteMany({ where: scope });
                await tx.stockMovement.deleteMany({ where: scope });
                await tx.stockBatch.deleteMany({ where: scope });
                await tx.inventory.deleteMany({ where: scope });
                await tx.customer.deleteMany({ where: scope });
                await tx.product.deleteMany({ where: scope });
                await tx.productCategory.deleteMany({ where: scope });
                await tx.idempotencyRecord.deleteMany({ where: scope });
                await tx.auditLog.deleteMany({ where: scope });
                await tx.authHandoff.deleteMany({ where: { user: scope } });
                await tx.user.deleteMany({ where: scope });
                await tx.branch.deleteMany({ where: scope });
                await tx.subscription.deleteMany({ where: scope });
                await tx.store.deleteMany({ where: { id: { in: storeIds } } });
            });
        }
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.$disconnect();
    }
});
