"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const billing_1 = require("../../../core/config/billing");
const AppError_1 = require("../../../core/errors/AppError");
const auth_token_1 = require("../../../core/utils/auth-token");
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
async function makeUniqueSlug(name) {
    const base = baseSlug(name);
    let slug = base;
    let suffix = 1;
    while (await prisma_1.prisma.store.findUnique({ where: { slug }, select: { id: true } })) {
        suffix += 1;
        slug = `${base}-${suffix}`;
    }
    return slug;
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
    };
}
exports.OnboardingService = {
    async registerStore(input) {
        const existingUser = await prisma_1.prisma.user.findUnique({
            where: { username: input.username },
            select: { id: true },
        });
        if (existingUser)
            throw new AppError_1.AppError(409, "Username is already taken");
        const plan = await prisma_1.prisma.plan.findFirst({
            where: { code: input.planCode, isActive: true },
            select: { id: true, code: true, name: true },
        });
        if (!plan)
            throw new AppError_1.AppError(404, "Selected plan not found");
        const slug = await makeUniqueSlug(input.storeName);
        const now = new Date();
        const trialEndsAt = (0, billing_1.addDays)(now, (0, billing_1.getTrialDays)());
        const hashedPassword = await bcrypt_1.default.hash(input.password, 12);
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
                select: { id: true, name: true, slug: true, status: true, trialEndsAt: true },
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
                },
                select: { id: true, fullName: true, username: true, role: true, storeId: true, branchId: true },
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
            await tx.auditLog.create({
                data: {
                    storeId: store.id,
                    actorId: owner.id,
                    action: client_1.AuditAction.STORE_REGISTERED,
                    metadata: { source: "landing", planCode: plan.code },
                },
            });
            return { store, branch, owner, subscription };
        }, prisma_1.transactionOptions);
        const accessToken = (0, auth_token_1.signAccessToken)({
            id: result.owner.id,
            role: result.owner.role,
            storeId: result.owner.storeId,
            branchId: result.owner.branchId,
        });
        return {
            accessToken,
            user: serializeOwner(result.owner),
            store: result.store,
            branch: result.branch,
            subscription: result.subscription,
        };
    },
};
