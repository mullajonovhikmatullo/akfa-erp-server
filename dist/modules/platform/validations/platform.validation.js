"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectPaymentSchema = exports.paymentStatusQuerySchema = exports.createPaymentSchema = exports.updateStoreStatusSchema = exports.listStoresQuerySchema = void 0;
const zod_1 = require("zod");
exports.listStoresQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).optional(),
    search: zod_1.z.string().max(120).optional(),
    page: zod_1.z
        .string()
        .optional()
        .transform((v) => Math.max(1, Number(v) || 1)),
    pageSize: zod_1.z
        .string()
        .optional()
        .transform((v) => Math.min(100, Math.max(1, Number(v) || 20))),
});
exports.updateStoreStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
    note: zod_1.z.string().max(500).optional(),
});
exports.createPaymentSchema = zod_1.z.object({
    storeId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive().multipleOf(0.01),
    currency: zod_1.z.enum(["UZS", "USD"]).default("UZS"),
    paidAt: zod_1.z.string().datetime().optional(),
    periodStart: zod_1.z.string().datetime().optional(),
    periodEnd: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().max(500).optional(),
});
exports.paymentStatusQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});
exports.rejectPaymentSchema = zod_1.z.object({
    note: zod_1.z.string().max(500).optional(),
});
