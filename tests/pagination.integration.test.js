const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("paginated low stock, expenses and expense categories", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
    for (const name of ["auth", "admins", "branches", "products", "inventory", "expenses", "analytics"]) {
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
    const planCode = `S${randomBytes(5).toString("hex").toUpperCase()}`;
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
        const username = `page_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Pagination", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Page owner");
        const O = owner.token;
        const B = owner.mainBranchId;

        await t.test("low stock is paginated, most critical first, with a shared total", async () => {
            for (let i = 1; i <= 7; i++) {
                const p = await request(O, "/api/products", "POST", {
                    name: `Low ${i}`, unit: "PIECE", costPriceUzs: 1, retailPriceUzs: 2, wholesalePriceUzs: 2, lowStockThreshold: 10,
                }, 201);
                await request(O, "/api/inventory/stock-in", "POST", { branchId: B, productId: p.id, quantity: i, costPriceUzs: 1 }, 201);
            }
            const healthy = await request(O, "/api/products", "POST", {
                name: "Healthy", unit: "PIECE", costPriceUzs: 1, retailPriceUzs: 2, wholesalePriceUzs: 2, lowStockThreshold: 1,
            }, 201);
            await request(O, "/api/inventory/stock-in", "POST", { branchId: B, productId: healthy.id, quantity: 50, costPriceUzs: 1 }, 201);

            const first = await request(O, "/api/analytics/inventory/low-stock?page=1&pageSize=3");
            const last = await request(O, "/api/analytics/inventory/low-stock?page=3&pageSize=3");
            assert.equal(first.total, 7);
            assert.deepEqual(first.items.map((row) => row.name), ["Low 1", "Low 2", "Low 3"]);
            assert.deepEqual(last.items.map((row) => [row.name, row.currentStock, row.threshold]), [["Low 7", 7, 10]]);
            await request(O, "/api/analytics/inventory/low-stock?pageSize=101", "GET", undefined, 422);
        });

        await t.test("expense categories page with and without inactive ones", async () => {
            const created = [];
            for (const name of ["Arenda", "Bonus", "Chiroq", "Dori", "Elektr"]) {
                created.push(await request(O, "/api/expenses/categories", "POST", { name }, 201));
            }
            await request(O, `/api/expenses/categories/${created[1].id}`, "PATCH", { isActive: false });
            const active = await request(O, "/api/expenses/categories?page=2&pageSize=2");
            assert.equal(active.total, 4);
            assert.deepEqual(active.items.map((c) => c.name), ["Dori", "Elektr"]);
            const all = await request(O, "/api/expenses/categories?page=1&pageSize=2&includeInactive=true");
            assert.equal(all.total, 5);
            assert.deepEqual(all.items.map((c) => c.name), ["Arenda", "Bonus"]);
            assert.ok(Array.isArray(await request(O, "/api/expenses/categories")));
        });

        await t.test("expenses page respects filters and newest-first order", async () => {
            const [rent, light] = (await request(O, "/api/expenses/categories")).filter((c) => ["Arenda", "Chiroq"].includes(c.name));
            for (let day = 1; day <= 5; day++) {
                await request(O, "/api/expenses", "POST", {
                    branchId: B, categoryId: day % 2 ? rent.id : light.id, amount: day * 1000,
                    description: `Expense ${day}`, expenseDate: `2026-09-0${day}T10:00:00.000Z`,
                }, 201);
            }
            const page = await request(O, "/api/expenses?page=1&pageSize=2");
            assert.equal(page.total, 5);
            assert.deepEqual(page.items.map((e) => e.description), ["Expense 5", "Expense 4"]);
            const filtered = await request(O, `/api/expenses?page=2&pageSize=1&categoryId=${rent.id}`);
            assert.equal(filtered.total, 3);
            assert.deepEqual(filtered.items.map((e) => e.description), ["Expense 3"]);
            assert.equal((await request(O, "/api/expenses")).length, 5);
        });
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (storeIds.length) {
            const scope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
                await tx.expense.deleteMany({ where: scope });
                await tx.expenseCategory.deleteMany({ where: scope });
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
