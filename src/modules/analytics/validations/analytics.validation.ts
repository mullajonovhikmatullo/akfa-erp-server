import { z } from "zod";

const dateParamSchema = z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
    .optional();

export const analyticsQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    from: dateParamSchema,
    to: dateParamSchema,
    period: z.enum(["day", "week", "month"]).default("day"),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 10)),
    lowStockThreshold: z
        .string()
        .optional()
        .transform((v) => {
            if (!v) return undefined;
            const parsed = Number(v);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        }),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
