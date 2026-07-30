"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdminsSchema = exports.updateAdminSchema = exports.createAdminSchema = void 0;
const zod_1 = require("zod");
exports.createAdminSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(100),
    username: zod_1.z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    password: zod_1.z.string().min(6).max(100),
    branchId: zod_1.z.string().uuid("branchId must be a valid UUID"),
}).strict();
exports.updateAdminSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(100).optional(),
    branchId: zod_1.z.string().uuid("branchId must be a valid UUID").nullable().optional(),
}).strict();
exports.listAdminsSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    isActive: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
