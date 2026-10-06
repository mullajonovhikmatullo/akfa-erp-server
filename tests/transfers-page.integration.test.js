const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("transfer list returns light paginated rows", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
    for (const name of ["auth", "admins", "branches", "products", "inventory", "transfers"]) {
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
        const username = `trf_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Transfers", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Transfer owner");
        const O = owner.token;
        const A = owner.mainBranchId;
        const B = (await request(O, "/api/branches", "POST", { name: "Filial B" }, 201)).id;
        const products = [];
        for (let i = 1; i <= 3; i++) {
            const p = await request(O, "/api/products", "POST", { name: `T${i}`, unit: "PIECE", costPriceUzs: 100, retailPriceUzs: 200, wholesalePriceUzs: 150 }, 201);
            await request(O, "/api/inventory/stock-in", "POST", { branchId: A, productId: p.id, quantity: 100, costPriceUzs: 100 }, 201);
            products.push(p);
        }
        const ids = [];
        for (let n = 1; n <= 3; n++) {
            const transfer = await request(O, "/api/transfers", "POST", {
                fromBranchId: A, toBranchId: B, note: `Transfer ${n}`,
                items: products.slice(0, n).map((p) => ({ productId: p.id, quantity: 2, unitCostUzs: 150 })),
            }, 201);
            ids.push(transfer.id);
        }
        await request(O, `/api/transfers/${ids[0]}/cancel`, "POST", {});

        await t.test("rows are light, newest first, with counts and totals", async () => {
            const page = await request(O, "/api/transfers?page=1&pageSize=2");
            assert.deepEqual([page.total, page.pendingCount], [3, 2]);
            assert.deepEqual(page.items.map((row) => [row.note, row.itemCount, Number(row.totalCostUzs)]), [["Transfer 3", 3, 900], ["Transfer 2", 2, 600]]);
            assert.equal(page.items[0].items, undefined);
            const filtered = await request(O, "/api/transfers?page=1&pageSize=10&status=CANCELLED");
            assert.deepEqual([filtered.total, filtered.pendingCount, filtered.items[0].note], [1, 2, "Transfer 1"]);
        });

        await t.test("the detail keeps the full item lines", async () => {
            const detail = await request(O, `/api/transfers/${ids[2]}`);
            assert.equal(detail.items.length, 3);
            assert.ok(Array.isArray(await request(O, "/api/transfers")));
        });
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (storeIds.length) {
            const scope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
                await tx.transferAllocation.deleteMany({ where: scope });
                await tx.transferItem.deleteMany({ where: scope });
                await tx.transfer.deleteMany({ where: scope });
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
