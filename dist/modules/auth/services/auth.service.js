"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.updateProfilePhotoSchema = exports.changePasswordSchema = exports.updateProfileSchema = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const auth_handoff_service_1 = require("../../../core/services/auth-handoff.service");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const auth_token_1 = require("../../../core/utils/auth-token");
const role_access_1 = require("../../../core/utils/role-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const socket_1 = require("../../../infrastructure/socket");
const profile_photo_service_1 = require("./profile-photo.service");
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
};
function serializeUser(user) {
    return {
        id: user.id,
        name: user.fullName,
        username: user.username,
        role: (0, role_access_1.toClientRole)(user.role),
        rawRole: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        base64Photo: user.base64Photo,
        thumbnailPhoto: user.thumbnailPhoto,
        mustChangePassword: user.mustChangePassword,
        store: user.store,
    };
}
function createAccessToken(user) {
    return (0, auth_token_1.signAccessToken)({
        id: user.id,
        role: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        authVersion: user.authVersion,
    });
}
async function assertTenantCanSignIn(user) {
    if ((0, role_access_1.isPlatformRole)(user.role))
        return;
    if (!user.storeId)
        throw new AppError_1.AppError(403, "Account is not assigned to a store");
    const billingState = await (0, billing_state_service_1.refreshStoreBillingState)(user.storeId);
    (0, billing_state_service_1.assertStoreReadable)(billingState);
}
async function assertTenantCanSignInInTransaction(tx, user) {
    if ((0, role_access_1.isPlatformRole)(user.role))
        return;
    if (!user.storeId)
        throw new AppError_1.AppError(403, "Account is not assigned to a store");
    await (0, plan_limit_service_1.lockStore)(tx, user.storeId);
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
    if (!billingState)
        throw new AppError_1.AppError(403, "Store account not found");
    (0, billing_state_service_1.assertStoreReadable)(billingState);
}
exports.updateProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, "Kamida 2 ta belgi").max(100).optional(),
    username: zod_1.z
        .string()
        .min(3, "Kamida 3 ta belgi")
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Faqat harf, raqam va _ belgisi")
        .optional(),
}).strict();
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, "Joriy parolni kiriting"),
    newPassword: zod_1.z.string().min(6, "Yangi parol kamida 6 ta belgi bo'lishi kerak").max(100),
    confirmPassword: zod_1.z.string().min(1, "Parolni tasdiqlang"),
}).strict().refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
});
exports.updateProfilePhotoSchema = zod_1.z.object({
    base64Photo: zod_1.z.string().min(32).max(7000000),
}).strict();
exports.AuthService = {
    async me(userId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: userProfileSelect,
        });
        if (!user || !user.isActive)
            throw new AppError_1.AppError(401, "Unauthorized");
        return serializeUser(user);
    },
    async updateProfile(userId, data) {
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive)
                throw new AppError_1.AppError(401, "Unauthorized");
            if (current.storeId) {
                await (0, billing_state_service_1.assertStoreReadableInTransaction)(tx, current.storeId);
            }
            if (data.username) {
                const existing = await tx.user.findUnique({ where: { username: data.username } });
                if (existing && existing.id !== userId) {
                    throw new AppError_1.AppError(409, "Bu foydalanuvchi nomi band");
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
        }, prisma_1.transactionOptions);
        return serializeUser(updated);
    },
    async updateProfilePhoto(userId, data) {
        const photos = await profile_photo_service_1.ProfilePhotoService.process(data.base64Photo);
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive)
                throw new AppError_1.AppError(401, "Unauthorized");
            if (current.storeId) {
                await (0, billing_state_service_1.assertStoreReadableInTransaction)(tx, current.storeId);
            }
            return tx.user.update({
                where: { id: userId },
                data: photos,
                select: userProfileSelect,
            });
        }, prisma_1.transactionOptions);
        return serializeUser(updated);
    },
    async deleteProfilePhoto(userId) {
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, storeId: true, isActive: true },
            });
            if (!current?.isActive)
                throw new AppError_1.AppError(401, "Unauthorized");
            if (current.storeId) {
                await (0, billing_state_service_1.assertStoreReadableInTransaction)(tx, current.storeId);
            }
            return tx.user.update({
                where: { id: userId },
                data: { base64Photo: null, thumbnailPhoto: null },
                select: userProfileSelect,
            });
        }, prisma_1.transactionOptions);
        return serializeUser(updated);
    },
    async changePassword(userId, data) {
        const user = await prisma_1.prisma.user.findUnique({
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
        if (!user)
            throw new AppError_1.AppError(404, "Foydalanuvchi topilmadi");
        const isMatch = await bcrypt_1.default.compare(data.currentPassword, user.password);
        if (!isMatch)
            throw new AppError_1.AppError(400, "Joriy parol noto'g'ri");
        const hashed = await bcrypt_1.default.hash(data.newPassword, 12);
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            if (user.storeId) {
                await (0, billing_state_service_1.assertStoreReadableInTransaction)(tx, user.storeId);
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
                throw new AppError_1.AppError(409, "Account changed. Sign in and try again.");
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
        }, prisma_1.transactionOptions);
        (0, socket_1.disconnectUserSockets)(userId);
        return {
            message: "Parol muvaffaqiyatli o'zgartirildi",
            accessToken: createAccessToken(updated),
        };
    },
    async login(data, audience = "store") {
        const user = await prisma_1.prisma.user.findUnique({
            where: { username: data.username },
            select: { ...userProfileSelect, password: true },
        });
        const isMatch = await bcrypt_1.default.compare(data.password, user?.password ?? DUMMY_PASSWORD_HASH);
        const roleMatches = user &&
            (audience === "platform" ? (0, role_access_1.isPlatformRole)(user.role) : !(0, role_access_1.isPlatformRole)(user.role));
        if (!user || !roleMatches || !isMatch) {
            throw new AppError_1.AppError(401, "Invalid credentials");
        }
        if (!user.isActive) {
            throw new AppError_1.AppError(403, "Account is disabled");
        }
        if (user.mustChangePassword) {
            throw new AppError_1.AppError(403, "Account setup is required");
        }
        await assertTenantCanSignIn(user);
        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },
    loginPlatform(data) {
        return exports.AuthService.login(data, "platform");
    },
    async exchangeHandoff(input) {
        const now = new Date();
        const tokenHash = (0, auth_handoff_service_1.hashHandoffCode)(input.handoffCode);
        const user = await prisma_1.prisma.$transaction(async (tx) => {
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
            if (!handoff ||
                handoff.purpose !== client_1.HandoffPurpose.LOGIN ||
                handoff.usedAt ||
                handoff.expiresAt.getTime() <= now.getTime() ||
                !handoff.user.isActive ||
                handoff.user.mustChangePassword) {
                throw new AppError_1.AppError(400, "Invalid or expired handoff code");
            }
            await assertTenantCanSignInInTransaction(tx, handoff.user);
            const consumed = await tx.authHandoff.updateMany({
                where: {
                    id: handoff.id,
                    purpose: client_1.HandoffPurpose.LOGIN,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (consumed.count !== 1) {
                throw new AppError_1.AppError(409, "Handoff code has already been used");
            }
            return handoff.user;
        }, prisma_1.transactionOptions);
        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },
    async completeAccountSetup(input) {
        const now = new Date();
        const tokenHash = (0, auth_handoff_service_1.hashHandoffCode)(input.setupCode);
        const hashedPassword = await bcrypt_1.default.hash(input.newPassword, 12);
        const user = await prisma_1.prisma.$transaction(async (tx) => {
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
            if (!handoff ||
                handoff.purpose !== client_1.HandoffPurpose.ACCOUNT_SETUP ||
                handoff.usedAt ||
                handoff.expiresAt.getTime() <= now.getTime() ||
                !handoff.user.isActive ||
                !handoff.user.mustChangePassword) {
                throw new AppError_1.AppError(400, "Invalid or expired setup code");
            }
            await assertTenantCanSignInInTransaction(tx, handoff.user);
            const consumed = await tx.authHandoff.updateMany({
                where: {
                    id: handoff.id,
                    purpose: client_1.HandoffPurpose.ACCOUNT_SETUP,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });
            if (consumed.count !== 1) {
                throw new AppError_1.AppError(409, "Setup code has already been used");
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
                    action: client_1.AuditAction.OWNER_ACCOUNT_ACTIVATED,
                    metadata: { method: "one-time-setup" },
                },
            });
            return updated;
        }, prisma_1.transactionOptions);
        return {
            accessToken: createAccessToken(user),
            user: serializeUser(user),
        };
    },
};
