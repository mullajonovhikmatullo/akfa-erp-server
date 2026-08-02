import { z } from "zod";

const receiptSchema = z.object({
    fileName: z.string().trim().min(1).max(160),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    base64: z.string().min(16).max(5_600_000),
}).strict();

export const submitTenantPaymentSchema = z.object({
    paidAt: z.string().datetime().optional(),
    note: z.string().trim().max(500).optional(),
    receipt: receiptSchema,
}).strict();

export const tenantPaymentQuerySchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export type SubmitTenantPaymentInput = z.infer<typeof submitTenantPaymentSchema>;
