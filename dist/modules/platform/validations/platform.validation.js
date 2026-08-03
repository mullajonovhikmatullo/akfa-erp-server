"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionStoreSchema = exports.deletePlanSchema = exports.updatePlanSchema = exports.createPlanSchema = exports.rejectPaymentSchema = exports.paymentStatusQuerySchema = exports.regenerateOwnerSetupSchema = exports.createPaymentSchema = exports.updateStorePlanSchema = exports.updateStoreStatusSchema = exports.listStoresQuerySchema = void 0;
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
    expectedVersion: zod_1.z.number().int().nonnegative(),
    note: zod_1.z.string().max(500).optional(),
    confirmation: zod_1.z.string().max(120).optional(),
    currentPassword: zod_1.z.string().min(1).max(200).optional(),
}).strict().superRefine((data, ctx) => {
    if ((data.status === "SUSPENDED" || data.status === "CANCELLED") &&
        (!data.note || data.note.trim().length < 3)) {
        ctx.addIssue({
            code: "custom",
            path: ["note"],
            message: "A reason of at least 3 characters is required",
        });
    }
    if (data.status === "CANCELLED" && !data.confirmation?.trim()) {
        ctx.addIssue({
            code: "custom",
            path: ["confirmation"],
            message: "Store name confirmation is required",
        });
    }
    if (data.status === "CANCELLED" && !data.currentPassword) {
        ctx.addIssue({
            code: "custom",
            path: ["currentPassword"],
            message: "Current platform owner password is required",
        });
    }
});
exports.updateStorePlanSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid(),
    expectedVersion: zod_1.z.number().int().nonnegative(),
}).strict();
exports.createPaymentSchema = zod_1.z.object({
    storeId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive().multipleOf(0.01),
    currency: zod_1.z.literal("UZS").default("UZS"),
    paidAt: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().max(500).optional(),
}).strict();
exports.regenerateOwnerSetupSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1).max(200),
}).strict();
exports.paymentStatusQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});
exports.rejectPaymentSchema = zod_1.z.object({
    note: zod_1.z.string().min(3).max(500),
}).strict();
const planCodeSchema = zod_1.z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Code must use uppercase letters, numbers and underscores");
const planLimitSchema = zod_1.z.number().int().min(1).max(1000000).nullable();
const planFieldsSchema = zod_1.z.object({
    code: planCodeSchema,
    name: zod_1.z.string().trim().min(2).max(80),
    monthlyPriceUzs: zod_1.z.number().int().min(0).max(1000000000),
    maxBranches: planLimitSchema,
    maxUsers: planLimitSchema,
    maxProducts: planLimitSchema,
    isPublic: zod_1.z.boolean(),
    isActive: zod_1.z.boolean(),
}).strict();
const validatePlanVisibility = (data, ctx) => {
    if (data.isPublic && !data.isActive) {
        ctx.addIssue({
            code: "custom",
            path: ["isPublic"],
            message: "A public plan must be active",
        });
    }
    if (data.isPublic && data.monthlyPriceUzs <= 0) {
        ctx.addIssue({
            code: "custom",
            path: ["monthlyPriceUzs"],
            message: "A public plan must have a positive monthly price",
        });
    }
};
exports.createPlanSchema = planFieldsSchema.superRefine(validatePlanVisibility);
exports.updatePlanSchema = planFieldsSchema.extend({
    expectedVersion: zod_1.z.number().int().nonnegative(),
}).superRefine(validatePlanVisibility);
exports.deletePlanSchema = zod_1.z.object({
    expectedVersion: zod_1.z.number().int().nonnegative(),
    currentPassword: zod_1.z.string().min(1).max(200),
}).strict();
exports.provisionStoreSchema = zod_1.z.object({
    storeName: zod_1.z.string().min(2).max(120),
    ownerName: zod_1.z.string().min(2).max(100),
    phone: zod_1.z.string().min(7).max(30),
    email: zod_1.z.string().email().max(120).optional(),
    username: zod_1.z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    planCode: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/),
    trialDays: zod_1.z.number().int().min(1).max(30).optional(),
}).strict();
