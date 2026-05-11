import { z } from "zod";

export const createCustomerSchema = z.object({
    branchId: z.string().uuid().optional(),
    fullName: z.string().min(2).max(150),
    phone: z
        .string()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number format")
        .optional(),
    address: z.string().max(300).optional(),
});

export const updateCustomerSchema = z.object({
    fullName: z.string().min(2).max(150).optional(),
    phone: z
        .string()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number format")
        .optional(),
    address: z.string().max(300).optional(),
    isActive: z.boolean().optional(),
});

export const customerQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    search: z.string().max(100).optional(),
    isActive: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    hasDebt: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
