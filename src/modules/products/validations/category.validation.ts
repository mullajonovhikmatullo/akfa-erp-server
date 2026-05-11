import { z } from "zod";

export const createCategorySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
});

export const updateCategorySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
});
