import {
    AuditAction,
    PaymentStatus,
    Prisma,
    StoreStatus,
    SubscriptionStatus,
    UserRole,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { addMonths } from "../../../core/config/billing";
import { AppError } from "../../../core/errors/AppError";
import {
    refreshDueBillingStates,
    refreshStoreBillingState,
} from "../../../core/services/billing-state.service";
import { allowedManualTransitions } from "../../../core/services/billing-policy";
import { lockStore } from "../../../core/services/plan-limit.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { disconnectStoreSockets } from "../../../infrastructure/socket";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { TenantProvisioningService } from "../../onboarding/services/tenant-provisioning.service";
import {
    CreatePaymentInput,
    CreatePlanInput,
    DeletePlanInput,
    ListStoresQuery,
    ProvisionStoreInput,
    RegenerateOwnerSetupInput,
    RejectPaymentInput,
    UpdateStoreStatusInput,
    UpdateStorePlanInput,
    UpdatePlanInput,
} from "../validations/platform.validation";

function parseOptionalDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
}

function resolvePaymentPeriod(currentPeriodEnd: Date | null) {
    const now = new Date();
    const futureCurrentEnd = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime();
    const periodStart = futureCurrentEnd ? currentPeriodEnd : now;
    const periodEnd = addMonths(periodStart, 1);

    return { periodStart, periodEnd };
}

const storeListSelect = {
    id: true,
    name: true,
    slug: true,
    ownerName: true,
    phone: true,
    email: true,
    status: true,
    billingVersion: true,
    trialEndsAt: true,
    activatedAt: true,
    suspendedAt: true,
    createdAt: true,
    updatedAt: true,
    plan: {
        select: {
            id: true,
            code: true,
            name: true,
            monthlyPriceUzs: true,
            maxBranches: true,
            maxUsers: true,
            maxProducts: true,
        },
    },
    subscription: {
        select: {
            id: true,
            status: true,
            trialEndsAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            nextPaymentDueAt: true,
            lastPaymentAt: true,
        },
    },
    users: {
        where: { role: { in: [UserRole.STORE_OWNER] as UserRole[] } },
        select: {
            id: true,
            username: true,
            fullName: true,
            isActive: true,
            mustChangePassword: true,
        },
        orderBy: { createdAt: "asc" as const },
        take: 1,
    },
    _count: { select: { branches: true, users: true, products: true } },
} as const;

const paymentSelect = {
    id: true,
    amount: true,
    currency: true,
    status: true,
    periodStart: true,
    periodEnd: true,
    paidAt: true,
    approvedAt: true,
    rejectedAt: true,
    rejectionReason: true,
    note: true,
    createdAt: true,
    store: { select: { id: true, name: true, slug: true, status: true } },
    branch: { select: { id: true, name: true } },
    submittedBy: { select: { id: true, fullName: true, username: true } },
    receiptMedia: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    },
    approvedBy: { select: { id: true, fullName: true, username: true } },
} as const;

const managedPlanSelect = {
    id: true,
    code: true,
    name: true,
    monthlyPriceUzs: true,
    maxBranches: true,
    maxUsers: true,
    maxProducts: true,
    isPublic: true,
    isActive: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { stores: true, subscriptions: true } },
} as const;

function serializeStore(store: any) {
    const { users, ...data } = store;
    return {
        ...data,
        plan: data.plan
            ? {
                ...data.plan,
                monthlyPriceUzs: Number(data.plan.monthlyPriceUzs),
            }
            : null,
        ownerAccount: users?.[0] ?? null,
        allowedStatusTransitions: store.subscription
            ? allowedManualTransitions(store.status, store.subscription)
            : [],
    };
}

function serializePayment(payment: any) {
    return {
        ...payment,
        amount: Number(payment.amount),
    };
}

function serializePlan(plan: any) {
    return {
        ...plan,
        monthlyPriceUzs: Number(plan.monthlyPriceUzs),
    };
}

async function lockPlanCatalog(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`LOCK TABLE "Plan" IN SHARE ROW EXCLUSIVE MODE`;
}

async function selectStore(id: string) {
    const store = await prisma.store.findUnique({ where: { id }, select: storeListSelect });
    if (!store) throw new AppError(404, "Store not found");
    return serializeStore(store);
}

async function assertPlatformOwnerPassword(actor: JwtPayload, currentPassword: string) {
    const account = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { password: true, isActive: true, role: true },
    });
    if (!account?.isActive || account.role !== UserRole.PLATFORM_OWNER) {
        throw new AppError(403, "Platform owner account is not active");
    }
    const passwordMatches = await bcrypt.compare(currentPassword, account.password);
    if (!passwordMatches) {
        throw new AppError(403, "Current password is incorrect");
    }
}

export const PlatformService = {
    async dashboard() {
        await refreshDueBillingStates();

        const now = new Date();
        const inSevenDays = new Date(now);
        inSevenDays.setDate(inSevenDays.getDate() + 7);

        const [storesByStatus, pendingPayments, overdueStores, renewalsDueSoon, activeStores] = await Promise.all([
            prisma.store.groupBy({ by: ["status"], _count: { id: true } }),
            prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
            prisma.store.count({ where: { status: StoreStatus.PAST_DUE } }),
            prisma.subscription.count({
                where: {
                    nextPaymentDueAt: { gte: now, lte: inSevenDays },
                    status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] },
                },
            }),
            prisma.store.count({ where: { status: StoreStatus.ACTIVE } }),
        ]);

        return {
            storesByStatus: storesByStatus.reduce<Record<string, number>>((acc, item) => {
                acc[item.status] = item._count.id;
                return acc;
            }, {}),
            activeStores,
            overdueStores,
            pendingPayments,
            renewalsDueSoon,
        };
    },

    async provisionStore(input: ProvisionStoreInput, actor: JwtPayload) {
        const result = await TenantProvisioningService.provisionByPlatform(input, actor);
        const store = await selectStore(result.store.id);

        return {
            store,
            owner: result.owner,
            setupCode: result.handoff.code,
            setupExpiresAt: result.handoff.expiresAt,
        };
    },

    async regenerateOwnerSetup(
        id: string,
        input: RegenerateOwnerSetupInput,
        actor: JwtPayload
    ) {
        await assertPlatformOwnerPassword(actor, input.currentPassword);
        return TenantProvisioningService.regenerateOwnerSetup(id, actor);
    },

    async listPlans() {
        const plans = await prisma.plan.findMany({
            where: { isActive: true },
            select: {
                id: true,
                code: true,
                name: true,
                monthlyPriceUzs: true,
                maxBranches: true,
                maxUsers: true,
                maxProducts: true,
            },
            orderBy: [{ monthlyPriceUzs: "asc" }, { code: "asc" }],
        });

        return plans.map((plan) => ({
            ...plan,
            monthlyPriceUzs: Number(plan.monthlyPriceUzs),
        }));
    },

    async listManagedPlans() {
        const plans = await prisma.plan.findMany({
            select: managedPlanSelect,
            orderBy: [{ isActive: "desc" }, { monthlyPriceUzs: "asc" }, { code: "asc" }],
        });
        return plans.map(serializePlan);
    },

    async createPlan(input: CreatePlanInput, actor: JwtPayload) {
        const plan = await prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const created = await tx.plan.create({
                data: input,
                select: managedPlanSelect,
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: AuditAction.PLAN_CREATED,
                    metadata: {
                        planId: created.id,
                        code: created.code,
                        name: created.name,
                        monthlyPriceUzs: input.monthlyPriceUzs,
                    },
                },
            });
            return created;
        }, transactionOptions);
        return serializePlan(plan);
    },

    async updatePlan(id: string, input: UpdatePlanInput, actor: JwtPayload) {
        const { expectedVersion, ...data } = input;
        const plan = await prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const current = await tx.plan.findUnique({
                where: { id },
                select: managedPlanSelect,
            });
            if (!current) throw new AppError(404, "Plan not found");
            if (current.version !== expectedVersion) {
                throw new AppError(409, "Plan changed. Refresh and try again.");
            }

            if (
                current.isActive &&
                current.isPublic &&
                (!data.isActive || !data.isPublic)
            ) {
                const alternatives = await tx.plan.count({
                    where: {
                        id: { not: id },
                        isActive: true,
                        isPublic: true,
                    },
                });
                if (alternatives === 0) {
                    throw new AppError(409, "At least one active public plan is required");
                }
            }

            const changed = await tx.plan.updateMany({
                where: { id, version: expectedVersion },
                data: { ...data, version: { increment: 1 } },
            });
            if (changed.count !== 1) {
                throw new AppError(409, "Plan changed. Refresh and try again.");
            }

            const updated = await tx.plan.findUniqueOrThrow({
                where: { id },
                select: managedPlanSelect,
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: AuditAction.PLAN_UPDATED,
                    metadata: {
                        planId: id,
                        from: {
                            code: current.code,
                            name: current.name,
                            monthlyPriceUzs: Number(current.monthlyPriceUzs),
                            isActive: current.isActive,
                            isPublic: current.isPublic,
                        },
                        to: {
                            code: updated.code,
                            name: updated.name,
                            monthlyPriceUzs: Number(updated.monthlyPriceUzs),
                            isActive: updated.isActive,
                            isPublic: updated.isPublic,
                        },
                        version: updated.version,
                    },
                },
            });
            return updated;
        }, transactionOptions);
        return serializePlan(plan);
    },

    async deletePlan(id: string, input: DeletePlanInput, actor: JwtPayload) {
        await assertPlatformOwnerPassword(actor, input.currentPassword);

        return prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const current = await tx.plan.findUnique({
                where: { id },
                select: managedPlanSelect,
            });
            if (!current) throw new AppError(404, "Plan not found");
            if (current.version !== input.expectedVersion) {
                throw new AppError(409, "Plan changed. Refresh and try again.");
            }

            if (current.isActive && current.isPublic) {
                const alternatives = await tx.plan.count({
                    where: {
                        id: { not: id },
                        isActive: true,
                        isPublic: true,
                    },
                });
                if (alternatives === 0) {
                    throw new AppError(409, "At least one active public plan is required");
                }
            }

            const isInUse =
                current._count.stores > 0 ||
                current._count.subscriptions > 0;
            if (isInUse) {
                const archived = await tx.plan.update({
                    where: { id },
                    data: {
                        isActive: false,
                        isPublic: false,
                        version: { increment: 1 },
                    },
                    select: managedPlanSelect,
                });
                await tx.auditLog.create({
                    data: {
                        actorId: actor.id,
                        action: AuditAction.PLAN_ARCHIVED,
                        metadata: {
                            planId: id,
                            code: current.code,
                            stores: current._count.stores,
                            subscriptions: current._count.subscriptions,
                            version: archived.version,
                        },
                    },
                });
                return { deleted: false, archived: true, plan: serializePlan(archived) };
            }

            await tx.plan.delete({ where: { id } });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: AuditAction.PLAN_DELETED,
                    metadata: { planId: id, code: current.code, name: current.name },
                },
            });
            return { deleted: true, archived: false, plan: null };
        }, transactionOptions);
    },

    async listStores(query: ListStoresQuery) {
        await refreshDueBillingStates();

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = {
            ...(query.status && { status: query.status }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" as const } },
                    { slug: { contains: query.search, mode: "insensitive" as const } },
                    { ownerName: { contains: query.search, mode: "insensitive" as const } },
                    { phone: { contains: query.search, mode: "insensitive" as const } },
                ],
            }),
        };

        const [items, total] = await Promise.all([
            prisma.store.findMany({
                where,
                select: storeListSelect,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.store.count({ where }),
        ]);

        return { items: items.map(serializeStore), total, page, pageSize };
    },

    async findStoreById(id: string) {
        await refreshStoreBillingState(id);
        return selectStore(id);
    },

    async updateStorePlan(id: string, input: UpdateStorePlanInput, actor: JwtPayload) {
        await refreshStoreBillingState(id);

        const updated = await prisma.$transaction(async (tx) => {
            await lockStore(tx, id);
            const store = await tx.store.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    planId: true,
                    billingVersion: true,
                    subscription: { select: { id: true, planId: true } },
                },
            });
            if (!store) throw new AppError(404, "Store not found");
            if (!store.subscription) throw new AppError(409, "Store subscription is not configured");
            if (store.billingVersion !== input.expectedVersion) {
                throw new AppError(409, "Store billing state changed. Refresh and try again.");
            }

            const targetPlan = await tx.plan.findUnique({
                where: { id: input.planId },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    isActive: true,
                    maxBranches: true,
                    maxUsers: true,
                    maxProducts: true,
                },
            });
            if (!targetPlan) throw new AppError(404, "Target plan not found");
            if (!targetPlan.isActive) throw new AppError(409, "Only active plans can be assigned to a store");

            if (store.planId === targetPlan.id && store.subscription.planId === targetPlan.id) {
                return tx.store.findUniqueOrThrow({ where: { id }, select: storeListSelect });
            }

            const pendingPayment = await tx.payment.findFirst({
                where: { storeId: id, status: PaymentStatus.PENDING },
                select: { id: true },
            });
            if (pendingPayment) {
                throw new AppError(409, "Resolve the pending payment before changing the store plan");
            }

            const [branchCount, activeUserCount, activeProductCount] = await Promise.all([
                tx.branch.count({ where: { storeId: id } }),
                tx.user.count({ where: { storeId: id, isActive: true } }),
                tx.product.count({ where: { storeId: id, isActive: true } }),
            ]);
            const limits = [
                { current: branchCount, limit: targetPlan.maxBranches, label: "branch" },
                { current: activeUserCount, limit: targetPlan.maxUsers, label: "active user" },
                { current: activeProductCount, limit: targetPlan.maxProducts, label: "active product" },
            ];
            const exceeded = limits.find(({ current, limit }) => limit !== null && current > limit);
            if (exceeded) {
                throw new AppError(
                    409,
                    `${targetPlan.name} plan ${exceeded.label} limit (${exceeded.limit}) is below current usage (${exceeded.current})`,
                );
            }

            const changed = await tx.store.updateMany({
                where: { id, billingVersion: input.expectedVersion },
                data: {
                    planId: targetPlan.id,
                    billingVersion: { increment: 1 },
                },
            });
            if (changed.count !== 1) {
                throw new AppError(409, "Store billing state changed. Refresh and try again.");
            }

            await tx.subscription.update({
                where: { id: store.subscription.id },
                data: { planId: targetPlan.id },
            });

            await tx.auditLog.create({
                data: {
                    storeId: id,
                    actorId: actor.id,
                    action: AuditAction.PLAN_UPDATED,
                    metadata: {
                        scope: "STORE_ASSIGNMENT",
                        fromPlanId: store.planId,
                        fromSubscriptionPlanId: store.subscription.planId,
                        toPlanId: targetPlan.id,
                        toPlanCode: targetPlan.code,
                        billingVersion: input.expectedVersion + 1,
                    },
                },
            });

            return tx.store.findUniqueOrThrow({ where: { id }, select: storeListSelect });
        }, transactionOptions);

        return serializeStore(updated);
    },

    async updateStoreStatus(id: string, input: UpdateStoreStatusInput, actor: JwtPayload) {
        if (input.status === StoreStatus.CANCELLED) {
            await assertPlatformOwnerPassword(actor, input.currentPassword!);
        }
        await refreshStoreBillingState(id);

        const updated = await prisma.$transaction(async (tx) => {
            await lockStore(tx, id);
            const store = await tx.store.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    slug: true,
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
            if (!store) throw new AppError(404, "Store not found");
            if (!store.subscription) throw new AppError(409, "Store subscription is not configured");
            if (
                store.status === StoreStatus.CANCELLED &&
                (input.status === StoreStatus.ACTIVE || input.status === StoreStatus.TRIALING)
            ) {
                if (!input.currentPassword) {
                    throw new AppError(422, "Current platform owner password is required");
                }
                await assertPlatformOwnerPassword(actor, input.currentPassword!);
            }
            if (store.billingVersion !== input.expectedVersion) {
                throw new AppError(409, "Store billing state changed. Refresh and try again.");
            }

            const allowed = allowedManualTransitions(store.status, store.subscription);
            if (!allowed.includes(input.status)) {
                throw new AppError(409, `Transition from ${store.status} to ${input.status} is not allowed`);
            }

            if (
                input.status === StoreStatus.CANCELLED &&
                input.confirmation?.trim() !== store.name &&
                input.confirmation?.trim() !== store.slug
            ) {
                throw new AppError(422, "Store name confirmation does not match");
            }

            const now = new Date();
            const changed = await tx.store.updateMany({
                where: {
                    id,
                    status: store.status,
                    billingVersion: input.expectedVersion,
                },
                data: {
                    status: input.status,
                    billingVersion: { increment: 1 },
                    suspendedAt: input.status === StoreStatus.SUSPENDED ? now : null,
                    ...(input.status === StoreStatus.ACTIVE && { activatedAt: now }),
                },
            });
            if (changed.count !== 1) {
                throw new AppError(409, "Store billing state changed. Refresh and try again.");
            }

            await tx.subscription.update({
                where: { id: store.subscription.id },
                data: { status: input.status as unknown as SubscriptionStatus },
            });

            let rejectedPendingPayments = 0;
            if (input.status === StoreStatus.CANCELLED) {
                const pending = await tx.payment.updateMany({
                    where: { storeId: id, status: PaymentStatus.PENDING },
                    data: {
                        status: PaymentStatus.REJECTED,
                        rejectedAt: now,
                        note: `Store cancelled: ${input.note!.trim()}`,
                    },
                });
                rejectedPendingPayments = pending.count;

                await tx.authHandoff.updateMany({
                    where: { user: { storeId: id }, usedAt: null },
                    data: { usedAt: now },
                });
                await tx.user.updateMany({
                    where: { storeId: id },
                    data: {
                        isActive: false,
                        authVersion: { increment: 1 },
                    },
                });
            }

            if (store.status === StoreStatus.CANCELLED &&
                (input.status === StoreStatus.ACTIVE || input.status === StoreStatus.TRIALING)) {
                // Revoke old sessions and restore tenant access atomically with
                // the status change. This also covers owners disabled at cancel.
                await tx.user.updateMany({
                    where: { storeId: id },
                    data: { isActive: true, authVersion: { increment: 1 } },
                });
            }

            await tx.auditLog.create({
                data: {
                    storeId: id,
                    actorId: actor.id,
                    action: AuditAction.STORE_STATUS_CHANGED,
                    metadata: {
                        from: store.status,
                        to: input.status,
                        note: input.note,
                        billingVersion: input.expectedVersion + 1,
                        rejectedPendingPayments,
                    },
                },
            });

            return tx.store.findUniqueOrThrow({
                where: { id },
                select: storeListSelect,
            });
        }, transactionOptions);

        if (input.status === StoreStatus.SUSPENDED || input.status === StoreStatus.CANCELLED) {
            disconnectStoreSockets(id);
        }

        return serializeStore(updated);
    },

    async listPayments(status?: PaymentStatus) {
        const payments = await prisma.payment.findMany({
            where: status ? { status } : undefined,
            select: paymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 200,
        });
        return payments.map(serializePayment);
    },

    async createPayment(input: CreatePaymentInput, actor: JwtPayload) {
        const payment = await prisma.$transaction(async (tx) => {
            await lockStore(tx, input.storeId);
            const store = await tx.store.findUnique({
                where: { id: input.storeId },
                select: {
                    id: true,
                    status: true,
                    plan: {
                        select: {
                            code: true,
                            monthlyPriceUzs: true,
                        },
                    },
                    subscription: { select: { id: true, currentPeriodEnd: true } },
                },
            });
            if (!store?.subscription) throw new AppError(404, "Store subscription not found");
            if (!store.plan) throw new AppError(409, "Store plan is not configured");
            if (store.status === StoreStatus.CANCELLED || store.status === StoreStatus.SUSPENDED) {
                throw new AppError(409, "Payments cannot be created for a blocked store");
            }

            const expectedAmount = Number(store.plan.monthlyPriceUzs);
            if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
                throw new AppError(409, "Store plan does not have a billable monthly price");
            }
            if (input.amount !== expectedAmount) {
                throw new AppError(
                    422,
                    `Payment amount must match the ${store.plan.code} monthly price (${expectedAmount} UZS)`
                );
            }

            const pendingPayment = await tx.payment.findFirst({
                where: { storeId: store.id, status: PaymentStatus.PENDING },
                select: { id: true },
            });
            if (pendingPayment) {
                throw new AppError(409, "This store already has a pending payment");
            }

            const { periodStart, periodEnd } = resolvePaymentPeriod(store.subscription.currentPeriodEnd);
            const payment = await tx.payment.create({
                data: {
                    storeId: store.id,
                    subscriptionId: store.subscription.id,
                    amount: input.amount,
                    currency: "UZS",
                    status: PaymentStatus.PENDING,
                    paidAt: parseOptionalDate(input.paidAt),
                    periodStart,
                    periodEnd,
                    note: input.note,
                },
                select: paymentSelect,
            });

            await tx.auditLog.create({
                data: {
                    storeId: store.id,
                    actorId: actor.id,
                    action: AuditAction.PAYMENT_CREATED,
                    metadata: {
                        paymentId: payment.id,
                        amount: expectedAmount,
                        currency: "UZS",
                        planCode: store.plan.code,
                        periodStart,
                        periodEnd,
                    },
                },
            });

            return payment;
        }, transactionOptions);
        return serializePayment(payment);
    },

    async approvePayment(id: string, actor: JwtPayload) {
        const reference = await prisma.payment.findUnique({
            where: { id },
            select: { storeId: true },
        });
        if (!reference) throw new AppError(404, "Payment not found");

        const payment = await prisma.$transaction(async (tx) => {
            await lockStore(tx, reference.storeId);
            const payment = await tx.payment.findUnique({
                where: { id },
                select: {
                    id: true,
                    status: true,
                    storeId: true,
                    subscriptionId: true,
                    periodStart: true,
                    periodEnd: true,
                    paidAt: true,
                    store: {
                        select: {
                            status: true,
                            subscription: { select: { id: true } },
                        },
                    },
                },
            });
            if (!payment) throw new AppError(404, "Payment not found");
            if (payment.status !== PaymentStatus.PENDING) {
                throw new AppError(409, "Only pending payments can be approved");
            }
            if (
                payment.store.status === StoreStatus.CANCELLED ||
                payment.store.status === StoreStatus.SUSPENDED
            ) {
                throw new AppError(409, "Blocked stores must be reviewed before payment approval");
            }
            if (!payment.subscriptionId || !payment.periodStart || !payment.periodEnd) {
                throw new AppError(409, "Payment period is incomplete");
            }
            if (
                payment.store.subscription?.id !== payment.subscriptionId ||
                payment.periodEnd.getTime() <= new Date().getTime()
            ) {
                throw new AppError(409, "Payment subscription or period is no longer valid");
            }

            const approvedAt = new Date();
            const claimed = await tx.payment.updateMany({
                where: { id, status: PaymentStatus.PENDING },
                data: {
                    status: PaymentStatus.APPROVED,
                    approvedAt,
                    approvedById: actor.id,
                    paidAt: payment.paidAt ?? approvedAt,
                },
            });
            if (claimed.count !== 1) {
                throw new AppError(409, "Payment was already processed");
            }

            await tx.subscription.update({
                where: { id: payment.subscriptionId },
                data: {
                    status: SubscriptionStatus.ACTIVE,
                    currentPeriodStart: payment.periodStart,
                    currentPeriodEnd: payment.periodEnd,
                    nextPaymentDueAt: payment.periodEnd,
                    lastPaymentAt: payment.paidAt ?? approvedAt,
                },
            });

            await tx.store.update({
                where: { id: payment.storeId },
                data: {
                    status: StoreStatus.ACTIVE,
                    billingVersion: { increment: 1 },
                    activatedAt: approvedAt,
                    suspendedAt: null,
                },
            });

            await tx.auditLog.createMany({
                data: [
                    {
                        storeId: payment.storeId,
                        actorId: actor.id,
                        action: AuditAction.PAYMENT_APPROVED,
                        metadata: {
                            paymentId: payment.id,
                            periodStart: payment.periodStart,
                            periodEnd: payment.periodEnd,
                        },
                    },
                    {
                        storeId: payment.storeId,
                        actorId: actor.id,
                        action: AuditAction.SUBSCRIPTION_EXTENDED,
                        metadata: { paymentId: payment.id, periodEnd: payment.periodEnd },
                    },
                ],
            });

            return tx.payment.findUniqueOrThrow({
                where: { id },
                select: paymentSelect,
            });
        }, transactionOptions);
        return serializePayment(payment);
    },

    async rejectPayment(id: string, input: RejectPaymentInput, actor: JwtPayload) {
        const payment = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id },
                select: { id: true, status: true, storeId: true },
            });
            if (!payment) throw new AppError(404, "Payment not found");
            if (payment.status !== PaymentStatus.PENDING) {
                throw new AppError(409, "Only pending payments can be rejected");
            }

            const rejectedAt = new Date();
            const changed = await tx.payment.updateMany({
                where: { id, status: PaymentStatus.PENDING },
                data: {
                    status: PaymentStatus.REJECTED,
                    rejectedAt,
                    rejectionReason: input.note,
                },
            });
            if (changed.count !== 1) {
                throw new AppError(409, "Payment was already processed");
            }

            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: AuditAction.PAYMENT_REJECTED,
                    metadata: { paymentId: payment.id, note: input.note },
                },
            });

            return tx.payment.findUniqueOrThrow({
                where: { id },
                select: paymentSelect,
            });
        }, transactionOptions);
        return serializePayment(payment);
    },
};
