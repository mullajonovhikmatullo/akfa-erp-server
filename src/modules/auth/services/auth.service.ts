import bcrypt from "bcrypt";
import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { signAccessToken } from "../../../core/utils/auth-token";
import { toClientRole } from "../../../core/utils/role-access";
import { prisma } from "../../../infrastructure/prisma/prisma";

const userProfileSelect = {
    id: true,
    fullName: true,
    username: true,
    role: true,
    branchId: true,
    storeId: true,
    isActive: true,
    store: {
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            trialEndsAt: true,
            subscription: {
                select: {
                    status: true,
                    trialEndsAt: true,
                    currentPeriodEnd: true,
                    nextPaymentDueAt: true,
                },
            },
            plan: { select: { code: true, name: true } },
        },
    },
} as const;

function serializeUser(user: any) {
    return {
        id: user.id,
        name: user.fullName,
        username: user.username,
        role: toClientRole(user.role),
        rawRole: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        store: user.store,
    };
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
            select: userProfileSelect,
        });
        if (!user || !user.isActive) throw new AppError(401, "Unauthorized");
        return serializeUser(user);
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
            select: userProfileSelect,
        });

        return serializeUser(updated);
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
            select: { ...userProfileSelect, password: true },
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

        const token = signAccessToken({
            id: user.id,
            role: user.role,
            storeId: user.storeId,
            branchId: user.branchId,
        });

        return {
            accessToken: token,
            user: serializeUser(user),
        };
    },
};
