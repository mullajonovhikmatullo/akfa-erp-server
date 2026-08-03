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
    expectedVersion: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
    confirmation: z.string().max(120).optional(),
    currentPassword: z.string().min(1).max(200).optional(),
}).strict().superRefine((data, ctx) => {
    if (
        (data.status === "SUSPENDED" || data.status === "CANCELLED") &&
        (!data.note || data.note.trim().length < 3)
    ) {
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

export const updateStorePlanSchema = z.object({
    planId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
}).strict();

export const createPaymentSchema = z.object({
    storeId: z.string().uuid(),
    amount: z.number().positive().multipleOf(0.01),
    currency: z.literal("UZS").default("UZS"),
    paidAt: z.string().datetime().optional(),
    note: z.string().max(500).optional(),
}).strict();

export const regenerateOwnerSetupSchema = z.object({
    currentPassword: z.string().min(1).max(200),
}).strict();

export const paymentStatusQuerySchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const rejectPaymentSchema = z.object({
    note: z.string().min(3).max(500),
}).strict();

const planCodeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Code must use uppercase letters, numbers and underscores");

const planLimitSchema = z.number().int().min(1).max(1_000_000).nullable();

const planFieldsSchema = z.object({
    code: planCodeSchema,
    name: z.string().trim().min(2).max(80),
    monthlyPriceUzs: z.number().int().min(0).max(1_000_000_000),
    maxBranches: planLimitSchema,
    maxUsers: planLimitSchema,
    maxProducts: planLimitSchema,
    isPublic: z.boolean(),
    isActive: z.boolean(),
}).strict();

const validatePlanVisibility = (data: z.infer<typeof planFieldsSchema>, ctx: z.RefinementCtx) => {
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

export const createPlanSchema = planFieldsSchema.superRefine(validatePlanVisibility);

export const updatePlanSchema = planFieldsSchema.extend({
    expectedVersion: z.number().int().nonnegative(),
}).superRefine(validatePlanVisibility);

export const deletePlanSchema = z.object({
    expectedVersion: z.number().int().nonnegative(),
    currentPassword: z.string().min(1).max(200),
}).strict();

export const provisionStoreSchema = z.object({
    storeName: z.string().min(2).max(120),
    ownerName: z.string().min(2).max(100),
    phone: z.string().min(7).max(30),
    email: z.string().email().max(120).optional(),
    username: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    planCode: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/),
    trialDays: z.number().int().min(1).max(30).optional(),
}).strict();

export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;
export type UpdateStoreStatusInput = z.infer<typeof updateStoreStatusSchema>;
export type UpdateStorePlanInput = z.infer<typeof updateStorePlanSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RegenerateOwnerSetupInput = z.infer<typeof regenerateOwnerSetupSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type ProvisionStoreInput = z.infer<typeof provisionStoreSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type DeletePlanInput = z.infer<typeof deletePlanSchema>;
