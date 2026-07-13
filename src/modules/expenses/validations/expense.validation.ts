import { z } from "zod";

export const createExpenseSchema = z.object({
    branchId: z.string().uuid().optional(),
    categoryId: z.string().uuid(),
    currency: z.enum(["UZS", "USD"]).default("UZS"),
    amount: z
        .number()
        .positive("Expense amount must be greater than 0")
        .multipleOf(0.01),
    amountUsd: z.number().nonnegative().multipleOf(0.0001).default(0),
    usdToUzsRate: z.number().positive("Exchange rate must be positive").optional(),
    description: z.string().max(500).optional(),
    expenseDate: z
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

export const expenseQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 500) : 100)),
});

export const expenseCategorySummaryQuerySchema = expenseQuerySchema.extend({
    limit: z
        .string()
        .optional()
        .transform((v) => {
            const parsed = v ? parseInt(v, 10) : 5;
            if (!Number.isFinite(parsed)) return 5;
            return Math.min(Math.max(parsed, 1), 20);
        }),
});
