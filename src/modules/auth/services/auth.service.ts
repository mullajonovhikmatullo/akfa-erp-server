import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { prisma } from "../../../infrastructure/prisma/prisma";

function normalizeRole(role: string) {
    return role === "SUPER_ADMIN" ? "super_admin" : "branch_admin";
}

export const updateProfileSchema = z.object({
    fullName: z.string().min(2, "Kamida 2 ta belgi").max(100).optional(),
    username: z
        .string()
        .min(3, "Kamida 3 ta belgi")
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Faqat harf, raqam va _ belgisi")
        .optional(),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Joriy parolni kiriting"),
    newPassword: z.string().min(6, "Yangi parol kamida 6 ta belgi bo'lishi kerak").max(100),
    confirmPassword: z.string().min(1, "Parolni tasdiqlang"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
});

export const AuthService = {
    async me(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, fullName: true, username: true, role: true, branchId: true, isActive: true },
        });
        if (!user || !user.isActive) throw new AppError(401, "Unauthorized");
        return {
            id: user.id,
            name: user.fullName,
            username: user.username,
            role: normalizeRole(user.role),
            branchId: user.branchId,
        };
    },

    async updateProfile(userId: string, data: z.infer<typeof updateProfileSchema>) {
        if (data.username) {
            const existing = await prisma.user.findUnique({ where: { username: data.username } });
            if (existing && existing.id !== userId) {
                throw new AppError(409, "Bu foydalanuvchi nomi band");
            }
        }

        const updated = await prisma.user.update({
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

    async changePassword(userId: string, data: z.infer<typeof changePasswordSchema>) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError(404, "Foydalanuvchi topilmadi");

        const isMatch = await bcrypt.compare(data.currentPassword, user.password);
        if (!isMatch) throw new AppError(400, "Joriy parol noto'g'ri");

        const hashed = await bcrypt.hash(data.newPassword, 10);
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

        return { message: "Parol muvaffaqiyatli o'zgartirildi" };
    },

    async login(data: { username: string; password: string }) {
        const user = await prisma.user.findUnique({
            where: { username: data.username },
        });

        if (!user) {
            throw new AppError(401, "Invalid credentials");
        }

        if (!user.isActive) {
            throw new AppError(403, "Account is disabled");
        }

        const isMatch = await bcrypt.compare(data.password, user.password);
        if (!isMatch) {
            throw new AppError(401, "Invalid credentials");
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, branchId: user.branchId },
            process.env.JWT_SECRET as string,
            { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"] }
        );

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
