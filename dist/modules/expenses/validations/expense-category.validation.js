"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpenseCategorySchema = exports.createExpenseCategorySchema = void 0;
const zod_1 = require("zod");
exports.createExpenseCategorySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100),
    description: zod_1.z.string().max(500).optional(),
});
exports.updateExpenseCategorySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100).optional(),
    description: zod_1.z.string().max(500).nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
});
