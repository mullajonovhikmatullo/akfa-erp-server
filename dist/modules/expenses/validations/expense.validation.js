"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseCategorySummaryQuerySchema = exports.expenseQuerySchema = exports.createExpenseSchema = void 0;
const zod_1 = require("zod");
exports.createExpenseSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid(),
    currency: zod_1.z.enum(["UZS", "USD"]).default("UZS"),
    amount: zod_1.z
        .number()
        .positive("Expense amount must be greater than 0")
        .multipleOf(0.01),
    amountUsd: zod_1.z.number().nonnegative().multipleOf(0.0001).default(0),
    usdToUzsRate: zod_1.z.number().positive("Exchange rate must be positive").optional(),
    description: zod_1.z.string().max(500).optional(),
    expenseDate: zod_1.z
        .string()
        .datetime({ message: "expenseDate must be ISO datetime" })
        .default(() => new Date().toISOString()),
})
    .refine((d) => d.currency === "UZS" || d.amountUsd > 0, {
    message: "USD amount is required",
    path: ["amountUsd"],
})
    .refine((d) => d.currency === "UZS" || d.usdToUzsRate !== undefined, {
    message: "usdToUzsRate is required for USD expenses",
    path: ["usdToUzsRate"],
});
exports.expenseQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid().optional(),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 500) : 100)),
});
exports.expenseCategorySummaryQuerySchema = exports.expenseQuerySchema.extend({
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => {
        const parsed = v ? parseInt(v, 10) : 5;
        if (!Number.isFinite(parsed))
            return 5;
        return Math.min(Math.max(parsed, 1), 20);
    }),
});
