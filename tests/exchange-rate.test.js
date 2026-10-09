const test = require("node:test");
const assert = require("node:assert/strict");
const { updateExchangeRateSchema } = require("../dist/modules/exchange-rates/validations/exchange-rate.validation");

test("exchange rate changes always carry the owner password", () => {
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "CBU", ownerPassword: "x" }).success, true);
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "MANUAL", rate: 12000, ownerPassword: "x" }).success, true);
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "MANUAL", rate: 12000 }).success, false);
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "MANUAL", ownerPassword: "x" }).success, false);
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "MANUAL", rate: 12, ownerPassword: "x" }).success, false);
    assert.equal(updateExchangeRateSchema.safeParse({ mode: "CBU", rate: 12000, ownerPassword: "x" }).success, false);
});
