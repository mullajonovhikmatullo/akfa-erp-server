"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.changePasswordSchema = exports.updateProfileSchema = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const AppError_1 = require("../../../core/errors/AppError");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
function normalizeRole(role) {
    return role === "SUPER_ADMIN" ? "super_admin" : "branch_admin";
}
exports.updateProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, "Kamida 2 ta belgi").max(100).optional(),
    username: zod_1.z
        .string()
        .min(3, "Kamida 3 ta belgi")
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Faqat harf, raqam va _ belgisi")
        .optional(),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, "Joriy parolni kiriting"),
    newPassword: zod_1.z.string().min(6, "Yangi parol kamida 6 ta belgi bo'lishi kerak").max(100),
    confirmPassword: zod_1.z.string().min(1, "Parolni tasdiqlang"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
});
exports.AuthService = {
    async me(userId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, fullName: true, username: true, role: true, branchId: true, isActive: true },
        });
        if (!user || !user.isActive)
            throw new AppError_1.AppError(401, "Unauthorized");
        return {
            id: user.id,
            name: user.fullName,
            username: user.username,
            role: normalizeRole(user.role),
            branchId: user.branchId,
        };
    },
    async updateProfile(userId, data) {
        if (data.username) {
            const existing = await prisma_1.prisma.user.findUnique({ where: { username: data.username } });
            if (existing && existing.id !== userId) {
                throw new AppError_1.AppError(409, "Bu foydalanuvchi nomi band");
            }
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.fullName && { fullName: data.fullName }),
                ...(data.username && { username: data.username }),
            },
            select: { id: true, fullName: true, username: true, role: true, branchId: true, isActive: true },
        });
        return {
            id: updated.id,
            name: updated.fullName,
            username: updated.username,
            role: normalizeRole(updated.role),
            branchId: updated.branchId,
        };
    },
    async changePassword(userId, data) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new AppError_1.AppError(404, "Foydalanuvchi topilmadi");
        const isMatch = await bcrypt_1.default.compare(data.currentPassword, user.password);
        if (!isMatch)
            throw new AppError_1.AppError(400, "Joriy parol noto'g'ri");
        const hashed = await bcrypt_1.default.hash(data.newPassword, 10);
        await prisma_1.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        return { message: "Parol muvaffaqiyatli o'zgartirildi" };
    },
    async login(data) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { username: data.username },
        });
        if (!user) {
            throw new AppError_1.AppError(401, "Invalid credentials");
        }
        if (!user.isActive) {
            throw new AppError_1.AppError(403, "Account is disabled");
        }
        const isMatch = await bcrypt_1.default.compare(data.password, user.password);
        if (!isMatch) {
            throw new AppError_1.AppError(401, "Invalid credentials");
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, branchId: user.branchId }, process.env.JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") });
        return {
            accessToken: token,
            user: {
                id: user.id,
                name: user.fullName,
                username: user.username,
                role: normalizeRole(user.role),
                branchId: user.branchId,
            },
        };
    },
};
