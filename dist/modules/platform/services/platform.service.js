"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformService = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const billing_1 = require("../../../core/config/billing");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const billing_policy_1 = require("../../../core/services/billing-policy");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const socket_1 = require("../../../infrastructure/socket");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const tenant_provisioning_service_1 = require("../../onboarding/services/tenant-provisioning.service");
function parseOptionalDate(value) {
    return value ? new Date(value) : undefined;
}
function resolvePaymentPeriod(currentPeriodEnd) {
    const now = new Date();
    const futureCurrentEnd = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime();
    const periodStart = futureCurrentEnd ? currentPeriodEnd : now;
    const periodEnd = (0, billing_1.addMonths)(periodStart, 1);
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
        where: { role: { in: [client_1.UserRole.STORE_OWNER, client_1.UserRole.SUPER_ADMIN] } },
        select: {
            id: true,
            username: true,
            fullName: true,
            isActive: true,
            mustChangePassword: true,
        },
        orderBy: { createdAt: "asc" },
        take: 1,
    },
    _count: { select: { branches: true, users: true, products: true } },
};
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
};
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
};
function serializeStore(store) {
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
            ? (0, billing_policy_1.allowedManualTransitions)(store.status, store.subscription)
            : [],
    };
}
function serializePayment(payment) {
    return {
        ...payment,
        amount: Number(payment.amount),
    };
}
function serializePlan(plan) {
    return {
        ...plan,
        monthlyPriceUzs: Number(plan.monthlyPriceUzs),
    };
}
async function lockPlanCatalog(tx) {
    await tx.$executeRaw `LOCK TABLE "Plan" IN SHARE ROW EXCLUSIVE MODE`;
}
async function selectStore(id) {
    const store = await prisma_1.prisma.store.findUnique({ where: { id }, select: storeListSelect });
    if (!store)
        throw new AppError_1.AppError(404, "Store not found");
    return serializeStore(store);
}
async function assertPlatformOwnerPassword(actor, currentPassword) {
    const account = await prisma_1.prisma.user.findUnique({
        where: { id: actor.id },
        select: { password: true, isActive: true, role: true },
    });
    if (!account?.isActive || account.role !== client_1.UserRole.PLATFORM_OWNER) {
        throw new AppError_1.AppError(403, "Platform owner account is not active");
    }
    const passwordMatches = await bcrypt_1.default.compare(currentPassword, account.password);
    if (!passwordMatches) {
        throw new AppError_1.AppError(403, "Current password is incorrect");
    }
}
exports.PlatformService = {
    async dashboard() {
        await (0, billing_state_service_1.refreshDueBillingStates)();
        const now = new Date();
        const inSevenDays = new Date(now);
        inSevenDays.setDate(inSevenDays.getDate() + 7);
        const [storesByStatus, pendingPayments, overdueStores, renewalsDueSoon, activeStores] = await Promise.all([
            prisma_1.prisma.store.groupBy({ by: ["status"], _count: { id: true } }),
            prisma_1.prisma.payment.count({ where: { status: client_1.PaymentStatus.PENDING } }),
            prisma_1.prisma.store.count({ where: { status: client_1.StoreStatus.PAST_DUE } }),
            prisma_1.prisma.subscription.count({
                where: {
                    nextPaymentDueAt: { gte: now, lte: inSevenDays },
                    status: { in: [client_1.SubscriptionStatus.TRIALING, client_1.SubscriptionStatus.ACTIVE] },
                },
            }),
            prisma_1.prisma.store.count({ where: { status: client_1.StoreStatus.ACTIVE } }),
        ]);
        return {
            storesByStatus: storesByStatus.reduce((acc, item) => {
                acc[item.status] = item._count.id;
                return acc;
            }, {}),
            activeStores,
            overdueStores,
            pendingPayments,
            renewalsDueSoon,
        };
    },
    async provisionStore(input, actor) {
        const result = await tenant_provisioning_service_1.TenantProvisioningService.provisionByPlatform(input, actor);
        const store = await selectStore(result.store.id);
        return {
            store,
            owner: result.owner,
            setupCode: result.handoff.code,
            setupExpiresAt: result.handoff.expiresAt,
        };
    },
    async regenerateOwnerSetup(id, input, actor) {
        await assertPlatformOwnerPassword(actor, input.currentPassword);
        return tenant_provisioning_service_1.TenantProvisioningService.regenerateOwnerSetup(id, actor);
    },
    async listPlans() {
        const plans = await prisma_1.prisma.plan.findMany({
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
        const plans = await prisma_1.prisma.plan.findMany({
            select: managedPlanSelect,
            orderBy: [{ isActive: "desc" }, { monthlyPriceUzs: "asc" }, { code: "asc" }],
        });
        return plans.map(serializePlan);
    },
    async createPlan(input, actor) {
        const plan = await prisma_1.prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const created = await tx.plan.create({
                data: input,
                select: managedPlanSelect,
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: client_1.AuditAction.PLAN_CREATED,
                    metadata: {
                        planId: created.id,
                        code: created.code,
                        name: created.name,
                        monthlyPriceUzs: input.monthlyPriceUzs,
                    },
                },
            });
            return created;
        }, prisma_1.transactionOptions);
        return serializePlan(plan);
    },
    async updatePlan(id, input, actor) {
        const { expectedVersion, ...data } = input;
        const plan = await prisma_1.prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const current = await tx.plan.findUnique({
                where: { id },
                select: managedPlanSelect,
            });
            if (!current)
                throw new AppError_1.AppError(404, "Plan not found");
            if (current.version !== expectedVersion) {
                throw new AppError_1.AppError(409, "Plan changed. Refresh and try again.");
            }
            if (current.isActive &&
                current.isPublic &&
                (!data.isActive || !data.isPublic)) {
                const alternatives = await tx.plan.count({
                    where: {
                        id: { not: id },
                        isActive: true,
                        isPublic: true,
                    },
                });
                if (alternatives === 0) {
                    throw new AppError_1.AppError(409, "At least one active public plan is required");
                }
            }
            const changed = await tx.plan.updateMany({
                where: { id, version: expectedVersion },
                data: { ...data, version: { increment: 1 } },
            });
            if (changed.count !== 1) {
                throw new AppError_1.AppError(409, "Plan changed. Refresh and try again.");
            }
            const updated = await tx.plan.findUniqueOrThrow({
                where: { id },
                select: managedPlanSelect,
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: client_1.AuditAction.PLAN_UPDATED,
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
        }, prisma_1.transactionOptions);
        return serializePlan(plan);
    },
    async deletePlan(id, input, actor) {
        await assertPlatformOwnerPassword(actor, input.currentPassword);
        return prisma_1.prisma.$transaction(async (tx) => {
            await lockPlanCatalog(tx);
            const current = await tx.plan.findUnique({
                where: { id },
                select: managedPlanSelect,
            });
            if (!current)
                throw new AppError_1.AppError(404, "Plan not found");
            if (current.version !== input.expectedVersion) {
                throw new AppError_1.AppError(409, "Plan changed. Refresh and try again.");
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
                    throw new AppError_1.AppError(409, "At least one active public plan is required");
                }
            }
            const isInUse = current._count.stores > 0 ||
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
                        action: client_1.AuditAction.PLAN_ARCHIVED,
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
                    action: client_1.AuditAction.PLAN_DELETED,
                    metadata: { planId: id, code: current.code, name: current.name },
                },
            });
            return { deleted: true, archived: false, plan: null };
        }, prisma_1.transactionOptions);
    },
    async listStores(query) {
        await (0, billing_state_service_1.refreshDueBillingStates)();
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = {
            ...(query.status && { status: query.status }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { slug: { contains: query.search, mode: "insensitive" } },
                    { ownerName: { contains: query.search, mode: "insensitive" } },
                    { phone: { contains: query.search, mode: "insensitive" } },
                ],
            }),
        };
        const [items, total] = await Promise.all([
            prisma_1.prisma.store.findMany({
                where,
                select: storeListSelect,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma_1.prisma.store.count({ where }),
        ]);
        return { items: items.map(serializeStore), total, page, pageSize };
    },
    async findStoreById(id) {
        await (0, billing_state_service_1.refreshStoreBillingState)(id);
        return selectStore(id);
    },
    async updateStoreStatus(id, input, actor) {
        if (input.status === client_1.StoreStatus.CANCELLED) {
            await assertPlatformOwnerPassword(actor, input.currentPassword);
        }
        await (0, billing_state_service_1.refreshStoreBillingState)(id);
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.lockStore)(tx, id);
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
            if (!store)
                throw new AppError_1.AppError(404, "Store not found");
            if (!store.subscription)
                throw new AppError_1.AppError(409, "Store subscription is not configured");
            if (store.status === client_1.StoreStatus.CANCELLED &&
                (input.status === client_1.StoreStatus.ACTIVE || input.status === client_1.StoreStatus.TRIALING)) {
                if (!input.currentPassword) {
                    throw new AppError_1.AppError(422, "Current platform owner password is required");
                }
                await assertPlatformOwnerPassword(actor, input.currentPassword);
            }
            if (store.billingVersion !== input.expectedVersion) {
                throw new AppError_1.AppError(409, "Store billing state changed. Refresh and try again.");
            }
            const allowed = (0, billing_policy_1.allowedManualTransitions)(store.status, store.subscription);
            if (!allowed.includes(input.status)) {
                throw new AppError_1.AppError(409, `Transition from ${store.status} to ${input.status} is not allowed`);
            }
            if (input.status === client_1.StoreStatus.CANCELLED &&
                input.confirmation?.trim() !== store.name &&
                input.confirmation?.trim() !== store.slug) {
                throw new AppError_1.AppError(422, "Store name confirmation does not match");
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
                    suspendedAt: input.status === client_1.StoreStatus.SUSPENDED ? now : null,
                    ...(input.status === client_1.StoreStatus.ACTIVE && { activatedAt: now }),
                },
            });
            if (changed.count !== 1) {
                throw new AppError_1.AppError(409, "Store billing state changed. Refresh and try again.");
            }
            await tx.subscription.update({
                where: { id: store.subscription.id },
                data: { status: input.status },
            });
            let rejectedPendingPayments = 0;
            if (input.status === client_1.StoreStatus.CANCELLED) {
                const pending = await tx.payment.updateMany({
                    where: { storeId: id, status: client_1.PaymentStatus.PENDING },
                    data: {
                        status: client_1.PaymentStatus.REJECTED,
                        rejectedAt: now,
                        note: `Store cancelled: ${input.note.trim()}`,
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
            if (store.status === client_1.StoreStatus.CANCELLED &&
                (input.status === client_1.StoreStatus.ACTIVE || input.status === client_1.StoreStatus.TRIALING)) {
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
                    action: client_1.AuditAction.STORE_STATUS_CHANGED,
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
        }, prisma_1.transactionOptions);
        if (input.status === client_1.StoreStatus.SUSPENDED || input.status === client_1.StoreStatus.CANCELLED) {
            (0, socket_1.disconnectStoreSockets)(id);
        }
        return serializeStore(updated);
    },
    async listPayments(status) {
        const payments = await prisma_1.prisma.payment.findMany({
            where: status ? { status } : undefined,
            select: paymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 200,
        });
        return payments.map(serializePayment);
    },
    async createPayment(input, actor) {
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.lockStore)(tx, input.storeId);
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
            if (!store?.subscription)
                throw new AppError_1.AppError(404, "Store subscription not found");
            if (!store.plan)
                throw new AppError_1.AppError(409, "Store plan is not configured");
            if (store.status === client_1.StoreStatus.CANCELLED || store.status === client_1.StoreStatus.SUSPENDED) {
                throw new AppError_1.AppError(409, "Payments cannot be created for a blocked store");
            }
            const expectedAmount = Number(store.plan.monthlyPriceUzs);
            if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
                throw new AppError_1.AppError(409, "Store plan does not have a billable monthly price");
            }
            if (input.amount !== expectedAmount) {
                throw new AppError_1.AppError(422, `Payment amount must match the ${store.plan.code} monthly price (${expectedAmount} UZS)`);
            }
            const pendingPayment = await tx.payment.findFirst({
                where: { storeId: store.id, status: client_1.PaymentStatus.PENDING },
                select: { id: true },
            });
            if (pendingPayment) {
                throw new AppError_1.AppError(409, "This store already has a pending payment");
            }
            const { periodStart, periodEnd } = resolvePaymentPeriod(store.subscription.currentPeriodEnd);
            const payment = await tx.payment.create({
                data: {
                    storeId: store.id,
                    subscriptionId: store.subscription.id,
                    amount: input.amount,
                    currency: "UZS",
                    status: client_1.PaymentStatus.PENDING,
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
                    action: client_1.AuditAction.PAYMENT_CREATED,
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
        }, prisma_1.transactionOptions);
        return serializePayment(payment);
    },
    async approvePayment(id, actor) {
        const reference = await prisma_1.prisma.payment.findUnique({
            where: { id },
            select: { storeId: true },
        });
        if (!reference)
            throw new AppError_1.AppError(404, "Payment not found");
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.lockStore)(tx, reference.storeId);
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
            if (!payment)
                throw new AppError_1.AppError(404, "Payment not found");
            if (payment.status !== client_1.PaymentStatus.PENDING) {
                throw new AppError_1.AppError(409, "Only pending payments can be approved");
            }
            if (payment.store.status === client_1.StoreStatus.CANCELLED ||
                payment.store.status === client_1.StoreStatus.SUSPENDED) {
                throw new AppError_1.AppError(409, "Blocked stores must be reviewed before payment approval");
            }
            if (!payment.subscriptionId || !payment.periodStart || !payment.periodEnd) {
                throw new AppError_1.AppError(409, "Payment period is incomplete");
            }
            if (payment.store.subscription?.id !== payment.subscriptionId ||
                payment.periodEnd.getTime() <= new Date().getTime()) {
                throw new AppError_1.AppError(409, "Payment subscription or period is no longer valid");
            }
            const approvedAt = new Date();
            const claimed = await tx.payment.updateMany({
                where: { id, status: client_1.PaymentStatus.PENDING },
                data: {
                    status: client_1.PaymentStatus.APPROVED,
                    approvedAt,
                    approvedById: actor.id,
                    paidAt: payment.paidAt ?? approvedAt,
                },
            });
            if (claimed.count !== 1) {
                throw new AppError_1.AppError(409, "Payment was already processed");
            }
            await tx.subscription.update({
                where: { id: payment.subscriptionId },
                data: {
                    status: client_1.SubscriptionStatus.ACTIVE,
                    currentPeriodStart: payment.periodStart,
                    currentPeriodEnd: payment.periodEnd,
                    nextPaymentDueAt: payment.periodEnd,
                    lastPaymentAt: payment.paidAt ?? approvedAt,
                },
            });
            await tx.store.update({
                where: { id: payment.storeId },
                data: {
                    status: client_1.StoreStatus.ACTIVE,
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
                        action: client_1.AuditAction.PAYMENT_APPROVED,
                        metadata: {
                            paymentId: payment.id,
                            periodStart: payment.periodStart,
                            periodEnd: payment.periodEnd,
                        },
                    },
                    {
                        storeId: payment.storeId,
                        actorId: actor.id,
                        action: client_1.AuditAction.SUBSCRIPTION_EXTENDED,
                        metadata: { paymentId: payment.id, periodEnd: payment.periodEnd },
                    },
                ],
            });
            return tx.payment.findUniqueOrThrow({
                where: { id },
                select: paymentSelect,
            });
        }, prisma_1.transactionOptions);
        return serializePayment(payment);
    },
    async rejectPayment(id, input, actor) {
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id },
                select: { id: true, status: true, storeId: true },
            });
            if (!payment)
                throw new AppError_1.AppError(404, "Payment not found");
            if (payment.status !== client_1.PaymentStatus.PENDING) {
                throw new AppError_1.AppError(409, "Only pending payments can be rejected");
            }
            const rejectedAt = new Date();
            const changed = await tx.payment.updateMany({
                where: { id, status: client_1.PaymentStatus.PENDING },
                data: {
                    status: client_1.PaymentStatus.REJECTED,
                    rejectedAt,
                    rejectionReason: input.note,
                },
            });
            if (changed.count !== 1) {
                throw new AppError_1.AppError(409, "Payment was already processed");
            }
            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.PAYMENT_REJECTED,
                    metadata: { paymentId: payment.id, note: input.note },
                },
            });
            return tx.payment.findUniqueOrThrow({
                where: { id },
                select: paymentSelect,
            });
        }, prisma_1.transactionOptions);
        return serializePayment(payment);
    },
};
