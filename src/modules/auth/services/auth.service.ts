import bcrypt from "bcrypt";
import { AuditAction, HandoffPurpose, Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import {
    assertStoreReadableInTransaction,
    assertStoreReadable,
    refreshStoreBillingState,
} from "../../../core/services/billing-state.service";
import { hashHandoffCode } from "../../../core/services/auth-handoff.service";
import { lockStore } from "../../../core/services/plan-limit.service";
import { signAccessToken } from "../../../core/utils/auth-token";
import { isPlatformRole, toClientRole } from "../../../core/utils/role-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import {
    CompleteAccountSetupInput,
    ExchangeHandoffInput,
    LoginInput,
} from "../validations/auth.validation";
import { ProfilePhotoService } from "./profile-photo.service";

const DUMMY_PASSWORD_HASH = "$2b$12$Og2YEkt0glpNIkU9KlJr.erRlnfbMPwycBetIqTqnqWEkiL0ep5DO";

const userProfileSelect = {
    id: true,
    fullName: true,
    username: true,
    role: true,
    branchId: true,
    storeId: true,
    isActive: true,
    mustChangePassword: true,
    authVersion: true,
    base64Photo: true,
    thumbnailPhoto: true,
    store: {
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            billingVersion: true,
            trialEndsAt: true,
            subscription: {
                select: {
                    status: true,
                    trialEndsAt: true,
                    currentPeriodEnd: true,
                    nextPaymentDueAt: true,
                },
            },
            plan: {
                select: {
                    code: true,
                    name: true,
                    maxBranches: true,
                    maxUsers: true,
                    maxProducts: true,
                },
            },
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
        base64Photo: user.base64Photo,
        thumbnailPhoto: user.thumbnailPhoto,
        mustChangePassword: user.mustChangePassword,
        store: user.store,
    };
}

function createAccessToken(user: {
    id: string;
    role: any;
    storeId: string | null;
    branchId: string | null;
    authVersion: number;
}) {
    return signAccessToken({
        id: user.id,
        role: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        authVersion: user.authVersion,
    });
}

async function assertTenantCanSignIn(user: {
    role: any;
    storeId: string | null;
}) {
    if (isPlatformRole(user.role)) return;
    if (!user.storeId) throw new AppError(403, "Account is not assigned to a store");

    const billingState = await refreshStoreBillingState(user.storeId);
    assertStoreReadable(billingState);
}

async function assertTenantCanSignInInTransaction(
    tx: Prisma.TransactionClient,
    user: { role: any; storeId: string | null }
) {
    if (isPlatformRole(user.role)) return;
    if (!user.storeId) throw new AppError(403, "Account is not assigned to a store");

    await lockStore(tx, user.storeId);
    const billingState = await tx.store.findUnique({
        where: { id: user.storeId },
        select: {
            id: true,
            status: true,
            billingVersion: true,
            subscription: {
                select: {
                    id: true,
                    status: true,
                    trialEndsAt: true,
                    currentPeriodEnd: true,
                },
            },
        },
    });
    if (!billingState) throw new AppError(403, "Store account not found");
    assertStoreReadable(billingState);
}

export const updateProfileSchema = z.object({
    fullName: z.string().min(2, "Kamida 2 ta belgi").max(100).optional(),
    username: z
        .string()
        .min(3, "Kamida 3 ta belgi")
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Faqat harf, raqam va _ belgisi")
        .optional(),
}).strict();

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Joriy parolni kiriting"),
    newPassword: z.string().min(6, "Yangi parol kamida 6 ta belgi bo'lishi kerak").max(100),
    confirmPassword: z.string().min(1, "Parolni tasdiqlang"),
}).strict().refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
});

export const updateProfilePhotoSchema = z.object({
    base64Photo: z.string().min(32).max(7_000_000),
}).strict();

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
        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive) throw new AppError(401, "Unauthorized");
            if (current.storeId) {
                await assertStoreReadableInTransaction(tx, current.storeId);
            }

            if (data.username) {
                const existing = await tx.user.findUnique({ where: { username: data.username } });
                if (existing && existing.id !== userId) {
                    throw new AppError(409, "Bu foydalanuvchi nomi band");
                }
            }

            return tx.user.update({
                where: { id: userId },
                data: {
                    ...(data.fullName && { fullName: data.fullName }),
                    ...(data.username && { username: data.username }),
                },
                select: userProfileSelect,
            });
        }, transactionOptions);

        return serializeUser(updated);
    },

    async updateProfilePhoto(userId: string, data: z.infer<typeof updateProfilePhotoSchema>) {
        const photos = await ProfilePhotoService.process(data.base64Photo);
        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive) throw new AppError(401, "Unauthorized");
            if (current.storeId) {
                await assertStoreReadableInTransaction(tx, current.storeId);
            }

            return tx.user.update({
                where: { id: userId },
                data: photos,
                select: userProfileSelect,
            });
        }, transactionOptions);

        return serializeUser(updated);
    },

    async deleteProfilePhoto(userId: string) {
        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive) throw new AppError(401, "Unauthorized");
            if (current.storeId) {
                await assertStoreReadableInTransaction(tx, current.storeId);
            }

            return tx.user.update({
                where: { id: userId },
                data: { base64Photo: null, thumbnailPhoto: null },
                select: userProfileSelect,
            });
        }, transactionOptions);

        return serializeUser(updated);
    },

    async changePassword(userId: string, data: z.infer<typeof changePasswordSchema>) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                password: true,
                role: true,
                storeId: true,
                branchId: true,
                authVersion: true,
            },
        });
        if (!user) throw new AppError(404, "Foydalanuvchi topilmadi");

        const isMatch = await bcrypt.compare(data.currentPassword, user.password);
        if (!isMatch) throw new AppError(400, "Joriy parol noto'g'ri");

        const hashed = await bcrypt.hash(data.newPassword, 12);
        const updated = await prisma.$transaction(async (tx) => {
            if (user.storeId) {
                await assertStoreReadableInTransaction(tx, user.storeId);
            }

            const changed = await tx.user.updateMany({
                where: {
                    id: userId,
                    password: user.password,
                    isActive: true,
                },
                data: {
                    password: hashed,
                    mustChangePassword: false,
                    authVersion: { increment: 1 },
                },
            });
            if (changed.count !== 1) {
                throw new AppError(409, "Account changed. Sign in and try again.");
            }

            return tx.user.findUniqueOrThrow({
                where: { id: userId },
                select: {
                    id: true,
                    role: true,
                    storeId: true,
                    branchId: true,
                    authVersion: true,
                },
            });
        }, transactionOptions);
        disconnectUserSockets(userId);

        return {
            message: "Parol muvaffaqiyatli o'zgartirildi",
            accessToken: createAccessToken(updated),
        };
    },

    async login(data: LoginInput, audience: "store" | "platform" = "store") {
        const user = await prisma.user.findUnique({
            where: { username: data.username },
            select: { ...userProfileSelect, password: true },
        });

        const isMatch = await bcrypt.compare(data.password, user?.password ?? DUMMY_PASSWORD_HASH);
        const roleMatches =
            user &&
            (audience === "platform" ? isPlatformRole(user.role) : !isPlatformRole(user.role));

        if (!user || !roleMatches || !isMatch) {
            throw new AppError(401, "Invalid credentials");
        }

        if (!user.isActive) {
            throw new AppError(403, "Account is disabled");
        }
        if (user.mustChangePassword) {
            throw new AppError(403, "Account setup is required");
        }

        await assertTenantCanSignIn(user);

        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },

    loginPlatform(data: LoginInput) {
        return AuthService.login(data, "platform");
    },

    async exchangeHandoff(input: ExchangeHandoffInput) {
        const now = new Date();
        const tokenHash = hashHandoffCode(input.handoffCode);

        const user = await prisma.$transaction(async (tx) => {
            const handoff = await tx.authHandoff.findUnique({
                where: { tokenHash },
                select: {
                    id: true,
                    purpose: true,
                    usedAt: true,
                    expiresAt: true,
                    user: { select: userProfileSelect },
                },
            });

            if (
                !handoff ||
                handoff.purpose !== HandoffPurpose.LOGIN ||
                handoff.usedAt ||
                handoff.expiresAt.getTime() <= now.getTime() ||
                !handoff.user.isActive ||
                handoff.user.mustChangePassword
            ) {
                throw new AppError(400, "Invalid or expired handoff code");
            }

            await assertTenantCanSignInInTransaction(tx, handoff.user);

            const consumed = await tx.authHandoff.updateMany({
                where: {
                    id: handoff.id,
                    purpose: HandoffPurpose.LOGIN,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (consumed.count !== 1) {
                throw new AppError(409, "Handoff code has already been used");
            }

            return handoff.user;
        }, transactionOptions);

        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },

    async completeAccountSetup(input: CompleteAccountSetupInput) {
        const now = new Date();
        const tokenHash = hashHandoffCode(input.setupCode);
        const hashedPassword = await bcrypt.hash(input.newPassword, 12);

        const user = await prisma.$transaction(async (tx) => {
            const handoff = await tx.authHandoff.findUnique({
                where: { tokenHash },
                select: {
                    id: true,
                    purpose: true,
                    usedAt: true,
                    expiresAt: true,
                    user: { select: userProfileSelect },
                },
            });

            if (
                !handoff ||
                handoff.purpose !== HandoffPurpose.ACCOUNT_SETUP ||
                handoff.usedAt ||
                handoff.expiresAt.getTime() <= now.getTime() ||
                !handoff.user.isActive ||
                !handoff.user.mustChangePassword
            ) {
                throw new AppError(400, "Invalid or expired setup code");
            }

            await assertTenantCanSignInInTransaction(tx, handoff.user);

            const consumed = await tx.authHandoff.updateMany({
                where: {
                    id: handoff.id,
                    purpose: HandoffPurpose.ACCOUNT_SETUP,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (consumed.count !== 1) {
                throw new AppError(409, "Setup code has already been used");
            }

            const updated = await tx.user.update({
                where: { id: handoff.user.id },
                data: {
                    password: hashedPassword,
                    mustChangePassword: false,
                    authVersion: { increment: 1 },
                },
                select: userProfileSelect,
            });

            await tx.auditLog.create({
                data: {
                    storeId: updated.storeId,
                    actorId: updated.id,
                    action: AuditAction.OWNER_ACCOUNT_ACTIVATED,
                    metadata: { method: "one-time-setup" },
                },
            });

            return updated;
        }, transactionOptions);

        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },
};
