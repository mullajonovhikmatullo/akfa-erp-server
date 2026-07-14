"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpenseCategorySchema = exports.createExpenseCategorySchema = void 0;
const zod_1 = require("zod");
exports.createExpenseCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).trim(),
    description: zod_1.z.string().max(500).optional(),
});
exports.updateExpenseCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).trim().optional(),
    description: zod_1.z.string().max(500).nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
});
