const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("paginated stock levels grouped by product", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
    for (const name of ["auth", "admins", "branches", "products", "inventory"]) {
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
        const username = `stock_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Stock levels", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Stock owner");
        const O = owner.token;
        const branchB = await request(O, "/api/branches", "POST", { name: "Filial B" }, 201);
        const adminUsername = `stock_admin_${randomBytes(4).toString("hex")}`;
        await request(O, "/api/admins", "POST", { fullName: "B admin", username: adminUsername, password: "secret123", branchId: branchB.id }, 201);
        const B = (await request(null, "/api/auth/login", "POST", { username: adminUsername, password: "secret123" })).accessToken;

        const create = (name, extra = {}) => request(O, "/api/products", "POST", {
            name, unit: "PIECE", costPriceUzs: 1, retailPriceUzs: 2, wholesalePriceUzs: 2, ...extra,
        }, 201);
        const stockIn = (productId, quantity, branchId = owner.mainBranchId) =>
            request(O, "/api/inventory/stock-in", "POST", { branchId, productId, quantity, costPriceUzs: 1 }, 201);

        // Twelve products named P01..P12 so pages are predictable; P05 is "out", P06 is "low".
        const products = [];
        for (let i = 1; i <= 12; i++) {
            products.push(await create(`P${String(i).padStart(2, "0")}`, i === 6 ? { lowStockThreshold: 5 } : {}));
        }
        for (const [index, product] of products.entries()) {
            if (index === 4) continue;
            await stockIn(product.id, index === 5 ? 3 : 10);
        }
        await stockIn(products[0].id, 7, branchB.id);
        const kg = await create("Rice 100%_mix", { unit: "KG" });
        await stockIn(kg.id, 2.5);

        await t.test("pages are ordered by name and share one total", async () => {
            const first = await request(O, "/api/inventory/stock?page=1&pageSize=5");
            const third = await request(O, "/api/inventory/stock?page=3&pageSize=5");
            assert.equal(first.total, 13);
            assert.deepEqual(first.items.map((row) => row.name), ["P01", "P02", "P03", "P04", "P05"]);
            assert.deepEqual(third.items.map((row) => row.name), ["P11", "P12", "Rice 100%_mix"]);
            assert.deepEqual(first.summary, { productCount: 13, totals: { PIECE: 10 * 10 + 3 + 7, KG: 2.5 } });
        });

        await t.test("a product sums every branch and lists them", async () => {
            const [p01] = (await request(O, "/api/inventory/stock?page=1&pageSize=1")).items;
            assert.equal(p01.quantity, 17);
            assert.deepEqual(p01.branches.map((b) => b.id).sort(), [owner.mainBranchId, branchB.id].sort());
            assert.equal(p01.everStocked, true);
            const [p05] = (await request(O, "/api/inventory/stock?search=P05")).items;
            assert.deepEqual([p05.quantity, p05.everStocked], [0, false]);
        });

        await t.test("search escapes wildcards and quantity filters apply before paging", async () => {
            const literal = await request(O, `/api/inventory/stock?search=${encodeURIComponent("100%_")}`);
            assert.deepEqual(literal.items.map((row) => row.name), ["Rice 100%_mix"]);
            assert.equal((await request(O, `/api/inventory/stock?search=${encodeURIComponent("_")}`)).total, 1);
            const out = await request(O, "/api/inventory/stock?quantity=out");
            assert.deepEqual(out.items.map((row) => row.name), ["P05"]);
            const low = await request(O, "/api/inventory/stock?quantity=low");
            assert.deepEqual(low.items.map((row) => row.name), ["P06"]);
            const available = await request(O, "/api/inventory/stock?quantity=available&pageSize=100");
            assert.equal(available.total, 11);
            assert.equal(available.summary.productCount, 13);
        });

        await t.test("branch staff only see their branch, even with a forged branchId", async () => {
            const own = await request(B, `/api/inventory/stock?branchId=${owner.mainBranchId}`);
            assert.equal(own.total, 1);
            assert.deepEqual(own.items.map((row) => [row.name, row.quantity]), [["P01", 7]]);
            assert.deepEqual(own.summary.totals, { PIECE: 7, KG: 0 });
            const ownerFiltered = await request(O, `/api/inventory/stock?branchId=${branchB.id}`);
            assert.equal(ownerFiltered.total, 1);
        });

        await t.test("another store sees none of these rows", async () => {
            const other = await register("Other stock store");
            const result = await request(other.token, "/api/inventory/stock");
            assert.deepEqual([result.total, result.items], [0, []]);
        });

        await t.test("invalid paging input is rejected", async () => {
            await request(O, "/api/inventory/stock?pageSize=101", "GET", undefined, 422);
            await request(O, "/api/inventory/stock?quantity=everything", "GET", undefined, 422);
        });
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (storeIds.length) {
            const scope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
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
