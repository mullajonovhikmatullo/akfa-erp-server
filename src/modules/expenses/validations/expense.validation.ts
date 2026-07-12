import { z } from "zod";

export const createExpenseSchema = z.object({
    branchId: z.string().uuid().optional(),
    categoryId: z.string().uuid(),
    amount: z
        .number()
        .positive("Expense amount must be greater than 0")
        .multipleOf(0.01),
    description: z.string().max(500).optional(),
    expenseDate: z
        .string()
        .datetime({ message: "expenseDate must be ISO datetime" })
        .default(() => new Date().toISOString()),
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
