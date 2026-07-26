import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import {
    AuditAction,
    HandoffPurpose,
    Prisma,
    StoreStatus,
    SubscriptionStatus,
} from "@prisma/client";
import { addDays, getTrialDays } from "../../../core/config/billing";
import { AppError } from "../../../core/errors/AppError";
import { createAuthHandoff } from "../../../core/services/auth-handoff.service";
import { assertStoreReadable } from "../../../core/services/billing-state.service";
import { lockStore } from "../../../core/services/plan-limit.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { toClientRole } from "../../../core/utils/role-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";

export type TenantProvisioningInput = {
    storeName: string;
    ownerName: string;
    phone: string;
    email?: string;
    username: string;
    password: string;
    planCode: string;
    trialDays?: number;
};

function baseSlug(value: string): string {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "store";
}

async function initialSlug(name: string): Promise<string> {
    const base = baseSlug(name);
    const exists = await prisma.store.findUnique({ where: { slug: base }, select: { id: true } });
    return exists ? `${base}-${randomBytes(3).toString("hex")}` : base;
}

function isUniqueConflict(error: unknown, field: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) return target.includes(field);
    return typeof target === "string" && target.includes(field);
}

function serializeOwner(user: {
    id: string;
    fullName: string;
    username: string;
    role: any;
    storeId: string | null;
    branchId: string | null;
    mustChangePassword: boolean;
}) {
    return {
        id: user.id,
        name: user.fullName,
        username: user.username,
        role: toClientRole(user.role),
        rawRole: user.role,
        storeId: user.storeId,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword,
    };
}

async function provision(
    input: TenantProvisioningInput,
    options: {
        publicRegistration: boolean;
        source: "landing" | "platform";
        actor?: JwtPayload;
        handoffPurpose: HandoffPurpose;
        mustChangePassword: boolean;
    }
) {
    const existingUser = await prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
    });
    if (existingUser) throw new AppError(409, "Username is already taken");

    const plan = await prisma.plan.findFirst({
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
    if (!plan) throw new AppError(404, "Selected plan is not available");
    if ((plan.maxBranches !== null && plan.maxBranches < 1) || (plan.maxUsers !== null && plan.maxUsers < 1)) {
        throw new AppError(409, "Selected plan cannot provision a tenant");
    }

    const now = new Date();
    const trialDays = input.trialDays ?? getTrialDays();
    const trialEndsAt = addDays(now, trialDays);
    const hashedPassword = await bcrypt.hash(input.password, 12);
    let slug = await initialSlug(input.storeName);

    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
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
                        status: SubscriptionStatus.TRIALING,
                        trialStartedAt: now,
                        trialEndsAt,
                        nextPaymentDueAt: trialEndsAt,
                    },
                    select: { id: true, status: true, trialEndsAt: true, nextPaymentDueAt: true },
                });

                const handoff = await createAuthHandoff(tx, {
                    userId: owner.id,
                    purpose: options.handoffPurpose,
                    createdById: options.actor?.id,
                });

                await tx.auditLog.create({
                    data: {
                        storeId: store.id,
                        actorId: options.actor?.id ?? owner.id,
                        action: AuditAction.STORE_REGISTERED,
                        metadata: {
                            source: options.source,
                            planCode: plan.code,
                            ownerUserId: owner.id,
                            trialDays,
                        },
                    },
                });

                return { store, branch, owner, subscription, handoff };
            }, transactionOptions);

            return {
                store: result.store,
                branch: result.branch,
                owner: serializeOwner(result.owner),
                subscription: result.subscription,
                handoff: result.handoff,
            };
        } catch (error) {
            if (isUniqueConflict(error, "slug")) {
                slug = `${baseSlug(input.storeName)}-${randomBytes(4).toString("hex")}`;
                continue;
            }
            if (isUniqueConflict(error, "username")) {
                throw new AppError(409, "Username is already taken");
            }
            throw error;
        }
    }

    throw new AppError(409, "Could not allocate a unique store address");
}

export const TenantProvisioningService = {
    registerPublic(input: TenantProvisioningInput) {
        return provision(input, {
            publicRegistration: true,
            source: "landing",
            handoffPurpose: HandoffPurpose.LOGIN,
            mustChangePassword: false,
        });
    },

    provisionByPlatform(input: Omit<TenantProvisioningInput, "password">, actor: JwtPayload) {
        return provision(
            {
                ...input,
                password: randomBytes(48).toString("base64url"),
            },
            {
                publicRegistration: false,
                source: "platform",
                actor,
                handoffPurpose: HandoffPurpose.ACCOUNT_SETUP,
                mustChangePassword: true,
            }
        );
    },

    async regenerateOwnerSetup(storeId: string, actor: JwtPayload) {
        return prisma.$transaction(async (tx) => {
            await lockStore(tx, storeId);
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
            if (!billingState) throw new AppError(404, "Store not found");
            assertStoreReadable(billingState);

            const owner = await tx.user.findFirst({
                where: {
                    storeId,
                    role: "STORE_OWNER",
                    isActive: true,
                    mustChangePassword: true,
                },
                select: { id: true, username: true },
            });
            if (!owner) throw new AppError(409, "Store owner setup is already complete or unavailable");

            const handoff = await createAuthHandoff(tx, {
                userId: owner.id,
                purpose: HandoffPurpose.ACCOUNT_SETUP,
                createdById: actor.id,
            });

            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: actor.id,
                    action: AuditAction.OWNER_SETUP_LINK_REGENERATED,
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
        }, transactionOptions);
    },
};
