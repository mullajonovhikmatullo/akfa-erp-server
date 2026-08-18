import { z } from "zod";

export const createExpenseCategorySchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
});

export const updateExpenseCategorySchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
});
