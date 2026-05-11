import { z } from "zod";

export const createAdminSchema = z.object({
    fullName: z.string().min(2).max(100),
    username: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    password: z.string().min(6).max(100),
    branchId: z.string().uuid("branchId must be a valid UUID"),
});

export const updateAdminSchema = z.object({
    fullName: z.string().min(2).max(100).optional(),
    branchId: z.string().uuid("branchId must be a valid UUID").nullable().optional(),
    isActive: z.boolean().optional(),
});

export const listAdminsSchema = z.object({
    branchId: z.string().uuid().optional(),
    isActive: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
