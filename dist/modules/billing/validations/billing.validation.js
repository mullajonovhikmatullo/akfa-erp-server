"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantPaymentQuerySchema = exports.submitTenantPaymentSchema = void 0;
const zod_1 = require("zod");
const receiptSchema = zod_1.z.object({
    fileName: zod_1.z.string().trim().min(1).max(160),
    mimeType: zod_1.z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    base64: zod_1.z.string().min(16).max(5600000),
}).strict();
exports.submitTenantPaymentSchema = zod_1.z.object({
    paidAt: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().trim().max(500).optional(),
    receipt: receiptSchema,
}).strict();
exports.tenantPaymentQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});
