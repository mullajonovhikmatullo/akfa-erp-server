"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debtPaymentQuerySchema = exports.saleQuerySchema = exports.addPaymentSchema = exports.createSaleSchema = exports.setDebtDeadlineSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const saleItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantity: zod_1.z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
});
exports.setDebtDeadlineSchema = zod_1.z.object({
    debtDueDate: zod_1.z.string().datetime().nullable(),
});
exports.createSaleSchema = zod_1.z
    .object({
    branchId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    saleType: zod_1.z.nativeEnum(client_1.SaleType),
    items: zod_1.z.array(saleItemSchema).min(1, "Sale must have at least one item"),
    paidAmountUzs: zod_1.z.number().nonnegative().default(0),
    paidAmountUsd: zod_1.z.number().nonnegative().default(0),
    usdToUzsRate: zod_1.z.number().positive("Exchange rate must be positive").optional(),
    paymentMethod: zod_1.z.nativeEnum(client_1.PaymentMethod),
    debtDueDate: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().max(500).optional(),
})
    .refine((d) => d.paidAmountUsd === 0 || d.usdToUzsRate !== undefined, { message: "usdToUzsRate is required when paying in USD", path: ["usdToUzsRate"] })
    .refine((d) => {
    const uniqueProducts = new Set(d.items.map((i) => i.productId));
    return uniqueProducts.size === d.items.length;
}, { message: "Duplicate products in sale items", path: ["items"] });
exports.addPaymentSchema = zod_1.z
    .object({
    amountUzs: zod_1.z.number().nonnegative().default(0),
    amountUsd: zod_1.z.number().nonnegative().default(0),
    usdToUzsRate: zod_1.z.number().positive("Exchange rate must be positive").optional(),
    paymentMethod: zod_1.z.nativeEnum(client_1.PaymentMethod),
    note: zod_1.z.string().max(500).optional(),
})
    .refine((d) => d.amountUzs > 0 || d.amountUsd > 0, { message: "Payment must include at least one non-zero amount" })
    .refine((d) => d.amountUsd === 0 || d.usdToUzsRate !== undefined, { message: "usdToUzsRate is required when paying in USD", path: ["usdToUzsRate"] });
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
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
});
exports.debtPaymentQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    paymentMethod: zod_1.z.nativeEnum(client_1.PaymentMethod).optional(),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    page: zod_1.z.coerce.number().int().positive().default(1),
    pageSize: zod_1.z.coerce.number().int().positive().max(100).default(10),
});
