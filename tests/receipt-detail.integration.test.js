const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("stock receipt detail by id", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
        const username = `rcpt_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Receipt detail", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Receipt owner");
        const O = owner.token;
        const branchB = await request(O, "/api/branches", "POST", { name: "Filial B" }, 201);
        const adminUsername = `rcpt_admin_${randomBytes(4).toString("hex")}`;
        await request(O, "/api/admins", "POST", { fullName: "B admin", username: adminUsername, password: "secret123", branchId: branchB.id }, 201);
        const B = (await request(null, "/api/auth/login", "POST", { username: adminUsername, password: "secret123" })).accessToken;
        const p = await request(O, "/api/products", "POST", { name: "R1", unit: "PIECE", costPriceUzs: 10, retailPriceUzs: 20, wholesalePriceUzs: 15 }, 201);
        const q = await request(O, "/api/products", "POST", { name: "R2", unit: "KG", costPriceUzs: 10, retailPriceUzs: 20, wholesalePriceUzs: 15 }, 201);
        const [first] = await request(O, "/api/inventory/stock-in/batch", "POST", [
            { branchId: owner.mainBranchId, productId: p.id, quantity: 3, costPriceUzs: 10 },
            { branchId: owner.mainBranchId, productId: q.id, quantity: 1.5, costPriceUzs: 20 },
        ], 201);

        await t.test("returns the same summary as the list row", async () => {
            const detail = await request(O, `/api/inventory/receipts/${first.receiptId}`);
            const [row] = (await request(O, "/api/inventory/receipts?page=1&pageSize=1")).items;
            assert.deepEqual(detail, row);
            assert.deepEqual([detail.productCount, detail.pieceQuantity, detail.kgQuantity, detail.totalCostUzs], [2, 3, 1.5, 60]);
        });

        await t.test("other branches, other stores and bad ids get errors", async () => {
            await request(B, `/api/inventory/receipts/${first.receiptId}`, "GET", undefined, 404);
            const other = await register("Other receipt store");
            await request(other.token, `/api/inventory/receipts/${first.receiptId}`, "GET", undefined, 404);
            await request(O, "/api/inventory/receipts/not-a-uuid", "GET", undefined, 422);
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
