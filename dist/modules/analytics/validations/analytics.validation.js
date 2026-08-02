"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsQuerySchema = void 0;
const zod_1 = require("zod");
const dateParamSchema = zod_1.z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
    .optional();
exports.analyticsQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    from: dateParamSchema,
    to: dateParamSchema,
    period: zod_1.z.enum(["day", "week", "month"]).default("day"),
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 10)),
    lowStockThreshold: zod_1.z
        .string()
        .optional()
        .transform((v) => {
        if (!v)
            return undefined;
        const parsed = Number(v);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }),
    topProductsSort: zod_1.z.enum(["revenue", "quantity"]).default("revenue"),
});
