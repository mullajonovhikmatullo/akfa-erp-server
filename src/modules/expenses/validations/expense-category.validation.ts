import { z } from "zod";

export const createExpenseCategorySchema = z.object({
    name: z.string().min(1).max(100).trim(),
    description: z.string().max(500).optional(),
});

export const updateExpenseCategorySchema = z.object({
    name: z.string().min(1).max(100).trim().optional(),
    description: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
});
