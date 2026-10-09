"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debtPaymentQuerySchema = exports.saleQuerySchema = exports.addPaymentSchema = exports.createSaleSchema = exports.setDebtDeadlineSchema = void 0;
const pagination_1 = require("../../../core/utils/pagination");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const saleItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantity: zod_1.z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
});
// Sales and debt payments are settled in UZS only; USD prices are converted with usdToUzsRate.
const uzsOnlyPaymentMethod = zod_1.z
    .nativeEnum(client_1.PaymentMethod)
    .refine((m) => m !== client_1.PaymentMethod.CASH_USD, { message: "Payments are accepted in UZS only" });
const zeroUsdAmount = zod_1.z.literal(0, { message: "Payments are accepted in UZS only" }).default(0);
exports.setDebtDeadlineSchema = zod_1.z.object({
    debtDueDate: zod_1.z.string().datetime().nullable(),
});
exports.createSaleSchema = zod_1.z
    .object({
    branchId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    saleType: zod_1.z.nativeEnum(client_1.SaleType),
    items: zod_1.z.array(saleItemSchema).min(1, "Sale must have at least one item").max(200),
    paidAmountUzs: zod_1.z.number().nonnegative().default(0),
    paidAmountUsd: zeroUsdAmount,
    usdToUzsRate: zod_1.z.number().positive("Exchange rate must be positive").optional(),
    paymentMethod: uzsOnlyPaymentMethod,
    debtDueDate: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().max(500).optional(),
})
    .refine((d) => {
    const uniqueProducts = new Set(d.items.map((i) => i.productId));
    return uniqueProducts.size === d.items.length;
}, { message: "Duplicate products in sale items", path: ["items"] });
exports.addPaymentSchema = zod_1.z
    .object({
    amountUzs: zod_1.z.number().positive("Payment must be greater than 0"),
    amountUsd: zeroUsdAmount,
    paymentMethod: uzsOnlyPaymentMethod,
    note: zod_1.z.string().max(500).optional(),
});
exports.saleQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    saleType: zod_1.z.nativeEnum(client_1.SaleType).optional(),
    hasDebt: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
    overdue: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    limit: (0, pagination_1.queryInteger)(50, 200),
});
exports.debtPaymentQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    paymentMethod: zod_1.z.nativeEnum(client_1.PaymentMethod).optional(),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    page: (0, pagination_1.queryInteger)(1, 1000000),
    pageSize: (0, pagination_1.queryInteger)(10, 100),
});
