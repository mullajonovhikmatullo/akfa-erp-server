const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("customer summary and purchased products", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
    for (const name of ["auth", "admins", "branches", "products", "customers", "sales", "inventory"]) {
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
    const planCode = `C${randomBytes(5).toString("hex").toUpperCase()}`;
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
        const username = `cust_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Customer detail", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Customer detail owner");
        const O = owner.token;
        const branchA = await request(O, "/api/branches", "POST", { name: "Filial A" }, 201);
        const branchB = await request(O, "/api/branches", "POST", { name: "Filial B" }, 201);
        async function admin(branchId) {
            const username = `cust_admin_${randomBytes(4).toString("hex")}`;
            await request(O, "/api/admins", "POST", { fullName: "Admin", username, password: "secret123", branchId }, 201);
            return (await request(null, "/api/auth/login", "POST", { username, password: "secret123" })).accessToken;
        }
        const A = await admin(branchA.id);
        const B = await admin(branchB.id);

        const piece = await request(O, "/api/products", "POST", { name: "Profil", unit: "PIECE", costPriceUzs: 10, retailPriceUzs: 100, wholesalePriceUzs: 80 }, 201);
        const kg = await request(O, "/api/products", "POST", { name: "Mix", unit: "KG", costPriceUzs: 10, retailPriceUzs: 50, wholesalePriceUzs: 40 }, 201);
        for (const branchId of [branchA.id, branchB.id]) {
            for (const productId of [piece.id, kg.id]) {
                await request(O, "/api/inventory/stock-in", "POST", { branchId, productId, quantity: 20, costPriceUzs: 10 }, 201);
            }
        }

        const customer = await request(A, "/api/customers", "POST", { fullName: "Detail customer", phone: "+998907771234", balance: 30 }, 201);
        await request(B, `/api/customers/${customer.id}/branches`, "POST", {});
        const sale = (token, items, extra) => request(token, "/api/sales", "POST", {
            saleType: "RETAIL", customerId: customer.id, items, ...extra,
        }, 201);
        const overdue = await sale(A, [{ productId: piece.id, quantity: 2 }], {
            paymentMethod: "CREDIT", paidAmountUzs: 50, debtDueDate: new Date(Date.now() - 3 * 86400000).toISOString(),
        });
        await sale(A, [{ productId: kg.id, quantity: 1 }], { paymentMethod: "CASH_UZS", paidAmountUzs: 50 });
        await sale(B, [{ productId: piece.id, quantity: 1 }], {
            paymentMethod: "CREDIT", paidAmountUzs: 0, debtDueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        });
        await request(A, `/api/sales/${overdue.id}/payments`, "POST", { amountUzs: 50, paymentMethod: "CASH_UZS" });

        await t.test("store managers get store-wide totals", async () => {
            const summary = await request(O, `/api/customers/${customer.id}/summary`);
            assert.equal(summary.balanceScope, "store");
            assert.equal(summary.balance, 230);
            assert.equal(summary.salesCount, 3);
            assert.equal(summary.totalAmountUzs, 350);
            assert.equal(summary.paidAmountUzs, 150);
            assert.equal(summary.debtAmountUzs, 200);
            assert.equal(summary.averageSaleUzs, 116.67);
            assert.deepEqual([summary.openDebtCount, summary.overdueCount, summary.overdueDebtUzs], [2, 1, 100]);
            assert.deepEqual([summary.debtPaymentsUzs, summary.debtPaymentCount, summary.productCount], [50, 1, 2]);
            assert.ok(summary.firstSaleAt && summary.lastSaleAt);
            assert.equal(summary.monthly.length, 12);
            assert.deepEqual(summary.monthly.at(-1), { month: summary.monthly.at(-1).month, salesCount: 3, totalAmountUzs: 350, paidAmountUzs: 150 });
            assert.ok(summary.monthly.slice(0, 11).every((row) => row.salesCount === 0));
        });

        await t.test("a branch scope limits totals and returns the branch share of the balance", async () => {
            const ownerB = await request(O, `/api/customers/${customer.id}/summary?branchId=${branchB.id}`);
            assert.deepEqual([ownerB.balanceScope, ownerB.balance, ownerB.salesCount, ownerB.totalAmountUzs, ownerB.debtAmountUzs], ["branch", 100, 1, 100, 100]);
            const adminA = await request(A, `/api/customers/${customer.id}/summary?branchId=${branchB.id}`);
            assert.deepEqual([adminA.balance, adminA.salesCount, adminA.totalAmountUzs, adminA.overdueCount], [130, 2, 250, 1]);
        });

        await t.test("purchased products are grouped, ordered by spend and paginated", async () => {
            const all = await request(O, `/api/customers/${customer.id}/products`);
            assert.equal(all.total, 2);
            assert.deepEqual(all.items.map((row) => [row.name, row.quantity, row.totalAmountUzs, row.purchaseCount]), [["Profil", 3, 300, 2], ["Mix", 1, 50, 1]]);
            const second = await request(O, `/api/customers/${customer.id}/products?page=2&pageSize=1`);
            assert.deepEqual([second.total, second.items.map((row) => row.name)], [2, ["Mix"]]);
            const branchOnly = await request(B, `/api/customers/${customer.id}/products`);
            assert.deepEqual(branchOnly.items.map((row) => [row.name, row.quantity]), [["Profil", 1]]);
        });

        await t.test("unlinked branch staff and other stores are refused", async () => {
            const onlyB = await request(B, "/api/customers", "POST", { fullName: "Only B", phone: "+998907775678" }, 201);
            await request(A, `/api/customers/${onlyB.id}/summary`, "GET", undefined, 403);
            await request(A, `/api/customers/${onlyB.id}/products`, "GET", undefined, 403);
            const other = await register("Other customer store");
            await request(other.token, `/api/customers/${customer.id}/summary`, "GET", undefined, 404);
            await request(other.token, `/api/customers/${customer.id}/products`, "GET", undefined, 404);
            await request(O, `/api/customers/${customer.id}/products?pageSize=101`, "GET", undefined, 422);
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
                await tx.customer.deleteMany({ where: scope });
                await tx.stockMovement.deleteMany({ where: scope });
                await tx.stockBatch.deleteMany({ where: scope });
                await tx.inventory.deleteMany({ where: scope });
                await tx.product.deleteMany({ where: scope });
                await tx.idempotencyRecord.deleteMany({ where: scope });
                await tx.auditLog.deleteMany({ where: scope });
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
