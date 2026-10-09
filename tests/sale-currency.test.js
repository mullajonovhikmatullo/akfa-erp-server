const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { addPaymentSchema, createSaleSchema } = require("../dist/modules/sales/validations/sale.validation");

const sale = (extra = {}) => ({
    saleType: "RETAIL",
    paymentMethod: "CASH_UZS",
    items: [{ productId: randomUUID(), quantity: 1 }],
    paidAmountUzs: 100,
    ...extra,
});

test("sales are paid in UZS only", () => {
    assert.equal(createSaleSchema.safeParse(sale()).success, true);
    assert.equal(createSaleSchema.safeParse(sale({ paidAmountUsd: 0, usdToUzsRate: 12700 })).success, true);
    assert.equal(createSaleSchema.safeParse(sale({ paidAmountUsd: 10, usdToUzsRate: 12700 })).success, false);
    assert.equal(createSaleSchema.safeParse(sale({ paymentMethod: "CASH_USD" })).success, false);
});

test("debt payments are accepted in UZS only", () => {
    assert.equal(addPaymentSchema.safeParse({ amountUzs: 5000, paymentMethod: "CARD" }).success, true);
    assert.equal(addPaymentSchema.safeParse({ amountUzs: 0, paymentMethod: "CASH_UZS" }).success, false);
    assert.equal(addPaymentSchema.safeParse({ amountUzs: 5000, amountUsd: 1, usdToUzsRate: 12700, paymentMethod: "CASH_UZS" }).success, false);
    assert.equal(addPaymentSchema.safeParse({ amountUzs: 5000, paymentMethod: "CASH_USD" }).success, false);
});
