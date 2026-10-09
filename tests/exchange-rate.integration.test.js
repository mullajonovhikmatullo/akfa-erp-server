const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcrypt");

// Explicit opt-in. Never fall back to the application's DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL;

test("Store exchange rate", { skip: !databaseUrl, timeout: 60000 }, async (t) => {
    assert.match(new URL(databaseUrl).pathname, /_test$/, "Use a dedicated database whose name ends in _test");
    let cbuResponse = { status: 200, body: [{ Ccy: "USD", Nominal: "1", Rate: "11846.57", Date: "09.10.2026" }] };
    const cbu = http.createServer((_req, res) => {
        res.writeHead(cbuResponse.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(cbuResponse.body));
    });
    await new Promise((resolve) => cbu.listen(0, "127.0.0.1", resolve));
    process.env.CBU_USD_RATE_URL = `http://127.0.0.1:${cbu.address().port}/`;
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    const { ExchangeRatesService } = require("../dist/modules/exchange-rates/services/exchange-rates.service");
    const planId = randomUUID();
    let storeId;

    try {
        await prisma.currencyRate.deleteMany({ where: { source: "CBU" } });
        await prisma.plan.create({ data: { id: planId, code: `TEST_${randomUUID()}`, name: "Rate tests" } });
        const store = await prisma.store.create({ data: {
            name: "Rate fixture", slug: `test-${randomUUID()}`, status: "ACTIVE", planId,
            trialEndsAt: new Date(Date.now() + 86400000),
            subscription: { create: { planId, status: "ACTIVE", trialEndsAt: new Date(Date.now() + 86400000), currentPeriodEnd: new Date(Date.now() + 86400000) } },
        } });
        storeId = store.id;
        const branch = await prisma.branch.create({ data: { storeId, name: "Main" } });
        await prisma.user.create({ data: {
            storeId, username: `owner_${randomUUID()}`, fullName: "Owner",
            password: await bcrypt.hash("owner-secret", 4), role: "STORE_OWNER",
        } });
        const cashierRow = await prisma.user.create({ data: {
            storeId, branchId: branch.id, username: `cashier_${randomUUID()}`, fullName: "Cashier",
            password: await bcrypt.hash("cashier-secret", 4), role: "CASHIER",
        } });
        const cashier = { id: cashierRow.id, storeId, branchId: branch.id, role: "CASHIER", authVersion: 0 };

        await t.test("defaults to the Central Bank rate", async () => {
            const current = await ExchangeRatesService.getCurrent(cashier);
            assert.equal(current.mode, "CBU");
            assert.equal(current.usdToUzsRate, 11846.57);
            assert.equal(current.cbu.rateDate, "2026-10-09");
            assert.equal(await ExchangeRatesService.resolveUsdToUzsRate(storeId), 11846.57);
        });

        await t.test("a Central Bank outage keeps the last known rate", async () => {
            cbuResponse = { status: 500, body: {} };
            await prisma.currencyRate.updateMany({ data: { fetchedAt: new Date(Date.now() - 2 * 3600000) } });
            const current = await ExchangeRatesService.getCurrent(cashier);
            assert.equal(current.usdToUzsRate, 11846.57);
            cbuResponse = { status: 200, body: [{ Ccy: "USD", Nominal: "1", Rate: "11850.00", Date: "10.10.2026" }] };
        });

        await t.test("changing the rate needs the store owner password", async () => {
            await assert.rejects(
                ExchangeRatesService.update({ mode: "MANUAL", rate: 12000, ownerPassword: "cashier-secret" }, cashier),
                (error) => error.statusCode === 403,
            );
            assert.equal((await ExchangeRatesService.getCurrent(cashier)).mode, "CBU");

            const updated = await ExchangeRatesService.update({ mode: "MANUAL", rate: 12000, ownerPassword: "owner-secret" }, cashier);
            assert.equal(updated.mode, "MANUAL");
            assert.equal(updated.usdToUzsRate, 12000);
            assert.equal(updated.changedBy.fullName, "Cashier");
            assert.equal(await ExchangeRatesService.resolveUsdToUzsRate(storeId), 12000);
            assert.equal(await prisma.auditLog.count({ where: { storeId, action: "EXCHANGE_RATE_CHANGED" } }), 1);
        });

        await t.test("switching back to the Central Bank rate", async () => {
            await prisma.currencyRate.updateMany({ data: { fetchedAt: new Date(Date.now() - 2 * 3600000) } });
            const updated = await ExchangeRatesService.update({ mode: "CBU", ownerPassword: "owner-secret" }, cashier);
            assert.equal(updated.mode, "CBU");
            assert.equal(updated.usdToUzsRate, 11850);
            assert.equal(updated.manualRate, 12000);
        });
    } finally {
        if (storeId) {
            for (const table of ["AuditLog", "User", "Branch", "Subscription"]) {
                await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "storeId" = $1`, storeId).catch(() => {});
            }
            await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
        }
        await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
        await prisma.currencyRate.deleteMany({ where: { source: "CBU" } }).catch(() => {});
        await prisma.$disconnect();
        cbu.close();
    }
});
