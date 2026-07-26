"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeAccountSetupSchema = exports.exchangeHandoffSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
exports.loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(50),
    password: zod_1.z.string().min(1).max(100),
}).strict();
exports.exchangeHandoffSchema = zod_1.z.object({
    handoffCode: zod_1.z.string().min(32).max(200),
}).strict();
exports.completeAccountSetupSchema = zod_1.z.object({
    setupCode: zod_1.z.string().min(32).max(200),
    newPassword: zod_1.z.string().min(10).max(100),
    confirmPassword: zod_1.z.string().min(1).max(100),
}).strict().refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});
