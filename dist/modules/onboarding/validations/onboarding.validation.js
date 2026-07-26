"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStoreSchema = void 0;
const zod_1 = require("zod");
exports.registerStoreSchema = zod_1.z.object({
    storeName: zod_1.z.string().min(2).max(120),
    ownerName: zod_1.z.string().min(2).max(100),
    phone: zod_1.z.string().min(7).max(30),
    email: zod_1.z.string().email().max(120).optional(),
    username: zod_1.z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    password: zod_1.z.string().min(10).max(100),
    confirmPassword: zod_1.z.string().min(1).max(100),
    planCode: zod_1.z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z0-9_]{1,29}$/)
        .default("START"),
}).strict().refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});
