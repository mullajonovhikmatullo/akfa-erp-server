import { z } from "zod";

export const analyticsQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    period: z.enum(["day", "week", "month"]).default("day"),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 10)),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
