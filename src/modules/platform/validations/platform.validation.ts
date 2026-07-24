import { z } from "zod";

export const listStoresQuerySchema = z.object({
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).optional(),
    search: z.string().max(120).optional(),
    page: z
        .string()
        .optional()
        .transform((v) => Math.max(1, Number(v) || 1)),
    pageSize: z
        .string()
        .optional()
        .transform((v) => Math.min(100, Math.max(1, Number(v) || 20))),
});

export const updateStoreStatusSchema = z.object({
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
    note: z.string().max(500).optional(),
});

export const createPaymentSchema = z.object({
    storeId: z.string().uuid(),
    amount: z.number().positive().multipleOf(0.01),
    currency: z.enum(["UZS", "USD"]).default("UZS"),
    paidAt: z.string().datetime().optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    note: z.string().max(500).optional(),
});

export const paymentStatusQuerySchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const rejectPaymentSchema = z.object({
    note: z.string().max(500).optional(),
});

export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;
export type UpdateStoreStatusInput = z.infer<typeof updateStoreStatusSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
