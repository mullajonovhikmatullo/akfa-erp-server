"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBranchSchema = exports.createBranchSchema = void 0;
const zod_1 = require("zod");
const branchFields = {
    name: zod_1.z.string().trim().min(1).max(120),
    address: zod_1.z.string().trim().max(300).optional(),
    phone: zod_1.z
        .string()
        .trim()
        .regex(/^\+?[0-9\s\-()]{7,30}$/, "Invalid phone number format")
        .optional(),
};
exports.createBranchSchema = zod_1.z.object(branchFields).strict();
exports.updateBranchSchema = zod_1.z
    .object({
    name: branchFields.name.optional(),
    address: branchFields.address,
    phone: branchFields.phone,
})
    .strict();
