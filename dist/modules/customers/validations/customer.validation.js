"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkCustomerBranchSchema = exports.customerPhoneCheckSchema = exports.customerQuerySchema = exports.updateCustomerSchema = exports.createCustomerSchema = void 0;
const zod_1 = require("zod");
exports.createCustomerSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    fullName: zod_1.z.string().min(2).max(150),
    phone: zod_1.z
        .string()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number format")
        .optional(),
    address: zod_1.z.string().max(300).optional(),
    balance: zod_1.z.number().optional(),
});
exports.updateCustomerSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(150).optional(),
    phone: zod_1.z
        .string()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number format")
        .optional(),
    address: zod_1.z.string().max(300).optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.customerQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().max(100).optional(),
    isActive: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    hasDebt: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
exports.customerPhoneCheckSchema = zod_1.z.object({
    phone: zod_1.z.string().min(7).max(20),
    branchId: zod_1.z.string().uuid().optional(),
});
exports.linkCustomerBranchSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
});
