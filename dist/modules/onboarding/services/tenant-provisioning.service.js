"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantProvisioningService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const billing_1 = require("../../../core/config/billing");
const AppError_1 = require("../../../core/errors/AppError");
const auth_handoff_service_1 = require("../../../core/services/auth-handoff.service");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const role_access_1 = require("../../../core/utils/role-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
function baseSlug(value) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "store";
}
async function initialSlug(name) {
    const base = baseSlug(name);
    const exists = await prisma_1.prisma.store.findUnique({ where: { slug: base }, select: { id: true } });
    return exists ? `${base}-${(0, crypto_1.randomBytes)(3).toString("hex")}` : base;
}
function isUniqueConflict(error, field) {
    if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }
    const target = error.meta?.target;
    if (Array.isArray(target))
        return target.includes(field);
    return typeof target === "string" && target.includes(field);
}
function serializeOwner(user) {
    return {
        id: user.id,
        name: user.fullName,
        username: user.username,
        role: (0, role_access_1.toClientRole)(user.role),
        rawRole: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword,
    };
}
async function provision(input, options) {
    const existingUser = await prisma_1.prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
    });
    if (existingUser)
        throw new AppError_1.AppError(409, "Username is already taken");
    const plan = await prisma_1.prisma.plan.findFirst({
        where: {
            code: input.planCode,
            isActive: true,
            ...(options.publicRegistration && { isPublic: true }),
        },
        select: {
            id: true,
            code: true,
            name: true,
            maxBranches: true,
            maxUsers: true,
        },
    });
    if (!plan)
        throw new AppError_1.AppError(404, "Selected plan is not available");
    if ((plan.maxBranches !== null && plan.maxBranches < 1) || (plan.maxUsers !== null && plan.maxUsers < 1)) {
        throw new AppError_1.AppError(409, "Selected plan cannot provision a tenant");
    }
    const now = new Date();
    const trialDays = input.trialDays ?? (0, billing_1.getTrialDays)();
    const trialEndsAt = (0, billing_1.addDays)(now, trialDays);
    const hashedPassword = await bcrypt_1.default.hash(input.password, 12);
    let slug = await initialSlug(input.storeName);
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const store = await tx.store.create({
                    data: {
                        name: input.storeName,
                        slug,
                        ownerName: input.ownerName,
                        phone: input.phone,
                        email: input.email,
                        status: client_1.StoreStatus.TRIALING,
                        planId: plan.id,
                        trialStartedAt: now,
                        trialEndsAt,
                    },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                        billingVersion: true,
                        trialEndsAt: true,
                    },
                });
                const branch = await tx.branch.create({
                    data: {
                        storeId: store.id,
                        name: "Asosiy filial",
                        phone: input.phone,
                    },
                    select: { id: true, name: true },
                });
                const owner = await tx.user.create({
                    data: {
                        storeId: store.id,
                        branchId: branch.id,
                        fullName: input.ownerName,
                        username: input.username,
                        password: hashedPassword,
                        role: "STORE_OWNER",
                        mustChangePassword: options.mustChangePassword,
                    },
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        role: true,
                        storeId: true,
                        branchId: true,
                        mustChangePassword: true,
                    },
                });
                const subscription = await tx.subscription.create({
                    data: {
                        storeId: store.id,
                        planId: plan.id,
                        status: client_1.SubscriptionStatus.TRIALING,
                        trialStartedAt: now,
                        trialEndsAt,
                        nextPaymentDueAt: trialEndsAt,
                    },
                    select: { id: true, status: true, trialEndsAt: true, nextPaymentDueAt: true },
                });
                const handoff = await (0, auth_handoff_service_1.createAuthHandoff)(tx, {
                    userId: owner.id,
                    purpose: options.handoffPurpose,
                    createdById: options.actor?.id,
                });
                await tx.auditLog.create({
                    data: {
                        storeId: store.id,
                        actorId: options.actor?.id ?? owner.id,
                        action: client_1.AuditAction.STORE_REGISTERED,
                        metadata: {
                            source: options.source,
                            planCode: plan.code,
                            ownerUserId: owner.id,
                            trialDays,
                        },
                    },
                });
                return { store, branch, owner, subscription, handoff };
            }, prisma_1.transactionOptions);
            return {
                store: result.store,
                branch: result.branch,
                owner: serializeOwner(result.owner),
                subscription: result.subscription,
                handoff: result.handoff,
            };
        }
        catch (error) {
            if (isUniqueConflict(error, "slug")) {
                slug = `${baseSlug(input.storeName)}-${(0, crypto_1.randomBytes)(4).toString("hex")}`;
                continue;
            }
            if (isUniqueConflict(error, "username")) {
                throw new AppError_1.AppError(409, "Username is already taken");
            }
            throw error;
        }
    }
    throw new AppError_1.AppError(409, "Could not allocate a unique store address");
}
exports.TenantProvisioningService = {
    registerPublic(input) {
        return provision(input, {
            publicRegistration: true,
            source: "landing",
            handoffPurpose: client_1.HandoffPurpose.LOGIN,
            mustChangePassword: false,
        });
    },
    provisionByPlatform(input, actor) {
        return provision({
            ...input,
            password: (0, crypto_1.randomBytes)(48).toString("base64url"),
        }, {
            publicRegistration: false,
            source: "platform",
            actor,
            handoffPurpose: client_1.HandoffPurpose.ACCOUNT_SETUP,
            mustChangePassword: true,
        });
    },
    async regenerateOwnerSetup(storeId, actor) {
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.lockStore)(tx, storeId);
            const billingState = await tx.store.findUnique({
                where: { id: storeId },
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
                throw new AppError_1.AppError(404, "Store not found");
            (0, billing_state_service_1.assertStoreReadable)(billingState);
            const owner = await tx.user.findFirst({
                where: {
                    storeId,
                    role: "STORE_OWNER",
                    isActive: true,
                    mustChangePassword: true,
                },
                select: { id: true, username: true },
            });
            if (!owner)
                throw new AppError_1.AppError(409, "Store owner setup is already complete or unavailable");
            const handoff = await (0, auth_handoff_service_1.createAuthHandoff)(tx, {
                userId: owner.id,
                purpose: client_1.HandoffPurpose.ACCOUNT_SETUP,
                createdById: actor.id,
            });
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.OWNER_SETUP_LINK_REGENERATED,
                    metadata: {
                        ownerUserId: owner.id,
                        expiresAt: handoff.expiresAt.toISOString(),
                    },
                },
            });
            return {
                owner: { id: owner.id, username: owner.username },
                setupCode: handoff.code,
                setupExpiresAt: handoff.expiresAt,
            };
        }, prisma_1.transactionOptions);
    },
};
