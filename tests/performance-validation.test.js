const test = require("node:test");
const assert = require("node:assert/strict");
const { listWindowSchema, paginationSchema } = require("../dist/core/utils/pagination");
const { createSaleSchema, saleQuerySchema } = require("../dist/modules/sales/validations/sale.validation");
const { createTransferSchema } = require("../dist/modules/transfers/validations/transfer.validation");
const { analyticsQuerySchema } = require("../dist/modules/analytics/validations/analytics.validation");
const { createConcurrencyLimit } = require("../dist/core/utils/concurrency-limit");
const { createRateLimit } = require("../dist/core/middleware/rateLimit");
const { idempotencyKeySchema } = require("../dist/core/services/idempotency.service");
const { errorHandler } = require("../dist/core/errors/errorHandler");

test("list inputs cannot send negative take, fractional pages, Infinity or oversized windows to Prisma", () => {
    for (const value of ["-1", "0", "1.5", "Infinity", "NaN", "20junk", "99999999999999999"]) {
        assert.equal(paginationSchema.safeParse({ page: value }).success, false, value);
        assert.equal(saleQuerySchema.safeParse({ limit: value }).success, false, value);
    }
    assert.equal(listWindowSchema.safeParse({ limit: "501" }).success, false);
    assert.deepEqual(listWindowSchema.parse({}), { limit: 100, offset: 0 });
    assert.deepEqual(listWindowSchema.parse({ limit: "500", offset: "500" }), { limit: 500, offset: 500 });
});

test("checkout and transfer reject pathological item arrays", () => {
    const { randomUUID } = require("node:crypto");
    const items = Array.from({ length: 201 }, () => ({ productId: randomUUID(), quantity: 1 }));
    assert.equal(createSaleSchema.safeParse({ saleType: "RETAIL", paymentMethod: "CASH_UZS", items }).success, false);
    assert.equal(createTransferSchema.safeParse({ toBranchId: randomUUID(), items }).success, false);
    assert.equal(idempotencyKeySchema.safeParse("x".repeat(129)).success, false);
    assert.equal(idempotencyKeySchema.safeParse("checkout:terminal-1:123").success, true);
});

test("analytics accepts hourly grouping and rejects unsupported periods", () => {
    assert.equal(analyticsQuerySchema.parse({ period: "hour" }).period, "hour");
    assert.equal(analyticsQuerySchema.safeParse({ period: "minute" }).success, false);
});

test("upload admission has a hard bound and release is idempotent", () => {
    const limiter = createConcurrencyLimit(2);
    const first = limiter.tryAcquire();
    const second = limiter.tryAcquire();
    assert.equal(limiter.tryAcquire(), null);
    first(); first();
    const third = limiter.tryAcquire();
    assert.equal(limiter.tryAcquire(), null);
    second(); third();
    assert.equal(typeof limiter.tryAcquire(), "function");
});

function response() {
    return { headersSent: false, headers: {}, statusCode: 200,
        setHeader(key, value) { this.headers[key] = value; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; } };
}

test("rate limiter refuses new keys at capacity without evicting existing enforcement", () => {
    const limit = createRateLimit({ max: 1, windowMs: 60000, maxKeys: 2 });
    const hit = (ip) => {
        const res = response();
        limit({ ip, socket: {} }, res, () => {});
        return res.statusCode;
    };
    assert.equal(hit("one"), 200);
    assert.equal(hit("two"), 200);
    assert.equal(hit("three"), 429);
    assert.equal(hit("one"), 429);
});

test("pool exhaustion, transaction conflicts and malformed bodies return predictable errors", () => {
    for (const [error, status] of [
        [{ code: "P2024" }, 503], [{ code: "P2034" }, 409],
        [{ code: "P2010", meta: { code: "55P03" } }, 503],
        [{ type: "entity.too.large" }, 413], [{ type: "entity.parse.failed" }, 400],
    ]) {
        const res = response();
        errorHandler(error, {}, res, () => assert.fail("unexpected next"));
        assert.equal(res.statusCode, status);
    }
    const error = new Error("already streaming");
    errorHandler(error, {}, { headersSent: true }, (forwarded) => assert.equal(forwarded, error));
});

test("OpenAPI advertises bounded windows and critical retry headers", () => {
    const { swaggerSpec } = require("../dist/core/config/swagger");
    const parameters = swaggerSpec.paths["/products"].get.parameters;
    assert.equal(parameters.find((item) => item.name === "limit").schema.maximum, 500);
    assert.equal(parameters.find((item) => item.name === "offset").schema.default, 0);
    assert.equal(swaggerSpec.paths["/sales"].post.parameters.find((item) => item.name === "Idempotency-Key").schema.maxLength, 128);
    assert.equal(swaggerSpec.components.schemas.CreateSaleRequest.properties.items.maxItems, 200);
    assert.deepEqual(swaggerSpec.components.schemas.AnalyticsPeriod.enum, ["hour", "day", "week", "month"]);
});
