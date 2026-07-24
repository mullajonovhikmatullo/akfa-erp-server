import bcrypt from "bcrypt";
import { AuditAction, StoreStatus, SubscriptionStatus } from "@prisma/client";
import { addDays, getTrialDays } from "../../../core/config/billing";
import { AppError } from "../../../core/errors/AppError";
import { signAccessToken } from "../../../core/utils/auth-token";
import { toClientRole } from "../../../core/utils/role-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { RegisterStoreInput } from "../validations/onboarding.validation";

function baseSlug(value: string): string {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "store";
}

async function makeUniqueSlug(name: string): Promise<string> {
    const base = baseSlug(name);
    let slug = base;
    let suffix = 1;

    while (await prisma.store.findUnique({ where: { slug }, select: { id: true } })) {
        suffix += 1;
        slug = `${base}-${suffix}`;
    }

    return slug;
}

function serializeOwner(user: {
    id: string;
    fullName: string;
    username: string;
    role: any;
    storeId: string | null;
    branchId: string | null;
}) {
    return {
        id: user.id,
        name: user.fullName,
        username: user.username,
        role: toClientRole(user.role),
        rawRole: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
    };
}

export const OnboardingService = {
    async registerStore(input: RegisterStoreInput) {
        const existingUser = await prisma.user.findUnique({
            where: { username: input.username },
            select: { id: true },
        });
        if (existingUser) throw new AppError(409, "Username is already taken");

        const plan = await prisma.plan.findFirst({
            where: { code: input.planCode, isActive: true },
            select: { id: true, code: true, name: true },
        });
        if (!plan) throw new AppError(404, "Selected plan not found");

        const slug = await makeUniqueSlug(input.storeName);
        const now = new Date();
        const trialEndsAt = addDays(now, getTrialDays());
        const hashedPassword = await bcrypt.hash(input.password, 12);

        const result = await prisma.$transaction(async (tx) => {
            const store = await tx.store.create({
                data: {
                    name: input.storeName,
                    slug,
                    ownerName: input.ownerName,
                    phone: input.phone,
                    email: input.email,
                    status: StoreStatus.TRIALING,
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
                    status: SubscriptionStatus.TRIALING,
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
                    action: AuditAction.STORE_REGISTERED,
                    metadata: { source: "landing", planCode: plan.code },
                },
            });

            return { store, branch, owner, subscription };
        }, transactionOptions);

        const accessToken = signAccessToken({
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
