const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("stock-in carries lot prices onto the product", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
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
        const username = `price_${randomBytes(6).toString("hex")}`;
        const password = randomBytes(12).toString("hex");
        const registered = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901112233", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(registered.store.id);
        const session = await request(null, "/api/auth/login", "POST", { username, password });
        return { token: session.accessToken, mainBranchId: session.user.branchId };
    }

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Stock-in prices", isPublic: true, maxUsers: 10, maxBranches: 10, maxProducts: 100, monthlyPriceUzs: 100 } });
        const owner = await register("Price owner");
        const O = owner.token;
        const B = owner.mainBranchId;
        await prisma.store.update({ where: { id: storeIds[0] }, data: { usdRateMode: "MANUAL", manualUsdToUzsRate: 12000 } });
        const product = (extra = {}) => request(O, "/api/products", "POST", {
            name: `Item ${randomBytes(3).toString("hex")}`, unit: "PIECE", costPriceUzs: 1000, retailPriceUzs: 1500, wholesalePriceUzs: 1200, ...extra,
        }, 201);
        const prices = async (id) => {
            const p = await request(O, `/api/products/${id}`);
            return [p.costPriceUzs, p.wholesalePriceUzs, p.retailPriceUzs, p.costPriceUsd, p.wholesalePriceUsd, p.retailPriceUsd].map((v) => (v == null ? null : Number(v)));
        };

        await t.test("a lot with new UZS prices updates the product and keeps them on the batch", async () => {
            const p = await product();
            const batch = await request(O, "/api/inventory/stock-in", "POST", {
                branchId: B, productId: p.id, quantity: 5, costPriceUzs: 1100, wholesalePriceUzs: 1300, retailPriceUzs: 1700,
            }, 201);
            assert.deepEqual([batch.costPriceUzs, batch.wholesalePriceUzs, batch.retailPriceUzs].map(Number), [1100, 1300, 1700]);
            assert.deepEqual((await prices(p.id)).slice(0, 3), [1100, 1300, 1700]);
        });

        await t.test("a batch receipt updates each product; the last line for a product wins", async () => {
            const [a, b] = [await product(), await product()];
            await request(O, "/api/inventory/stock-in/batch", "POST", [
                { branchId: B, productId: a.id, quantity: 1, costPriceUzs: 900, wholesalePriceUzs: 1000, retailPriceUzs: 1400 },
                { branchId: B, productId: b.id, quantity: 1, costPriceUzs: 2000, wholesalePriceUzs: 2500, retailPriceUzs: 3000 },
                { branchId: B, productId: a.id, quantity: 1, costPriceUzs: 950, wholesalePriceUzs: 1100, retailPriceUzs: 1450 },
            ], 201);
            assert.deepEqual((await prices(a.id)).slice(0, 3), [950, 1100, 1450]);
            assert.deepEqual((await prices(b.id)).slice(0, 3), [2000, 2500, 3000]);
        });

        await t.test("a USD-priced product is updated in USD", async () => {
            const p = await product({ costPriceUzs: 0, retailPriceUzs: 0, wholesalePriceUzs: 0, costPriceUsd: 10, wholesalePriceUsd: 12, retailPriceUsd: 15 });
            const batch = await request(O, "/api/inventory/stock-in", "POST", {
                branchId: B, productId: p.id, quantity: 2, costPriceUzs: 1, costPriceUsd: 11, wholesalePriceUsd: 13, retailPriceUsd: 16, usdToUzsRate: 12000,
            }, 201);
            assert.deepEqual(await prices(p.id), [0, 0, 0, 11, 13, 16]);
            const saved = await prisma.stockBatch.findUnique({ where: { id: batch.id }, select: { costPriceUzs: true } });
            assert.equal(Number(saved.costPriceUzs), 132000);
        });

        await t.test("a USD stock-in needs the current store rate", async () => {
            const p = await product({ costPriceUzs: 0, retailPriceUzs: 0, wholesalePriceUzs: 0, costPriceUsd: 10, wholesalePriceUsd: 12, retailPriceUsd: 15 });
            const body = { branchId: B, productId: p.id, quantity: 1, costPriceUzs: 120000, costPriceUsd: 10 };
            await request(O, "/api/inventory/stock-in", "POST", { ...body, usdToUzsRate: 12650 }, 409);
            await request(O, "/api/inventory/stock-in", "POST", body, 422);
            await request(O, "/api/inventory/stock-in/batch", "POST", [{ ...body, usdToUzsRate: 12650 }], 409);
            await request(O, "/api/inventory/stock-in/batch", "POST", [{ ...body, usdToUzsRate: 12000 }], 201);
        });

        await t.test("a stock-in without sale prices leaves the product untouched", async () => {
            const p = await product();
            await request(O, "/api/inventory/stock-in", "POST", { branchId: B, productId: p.id, quantity: 1, costPriceUzs: 1100 }, 201);
            assert.deepEqual((await prices(p.id)).slice(0, 3), [1000, 1200, 1500]);
        });

        await t.test("inconsistent sale prices are rejected", async () => {
            const p = await product();
            const send = (extra) => request(O, "/api/inventory/stock-in", "POST", { branchId: B, productId: p.id, quantity: 1, costPriceUzs: 1000, ...extra }, 422);
            await send({ retailPriceUzs: 1500 });
            await send({ wholesalePriceUzs: 1600, retailPriceUzs: 1500 });
            await send({ wholesalePriceUzs: 900, retailPriceUzs: 1500 });
            await send({ wholesalePriceUsd: 1, retailPriceUsd: 2 });
            assert.deepEqual((await prices(p.id)).slice(0, 3), [1000, 1200, 1500]);
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
