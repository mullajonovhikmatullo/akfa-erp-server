"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformService = void 0;
const client_1 = require("@prisma/client");
const billing_1 = require("../../../core/config/billing");
const AppError_1 = require("../../../core/errors/AppError");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
function parseOptionalDate(value) {
    return value ? new Date(value) : undefined;
}
function resolvePaymentPeriod(currentPeriodEnd, input) {
    const now = new Date();
    const futureCurrentEnd = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime();
    const periodStart = parseOptionalDate(input.periodStart) ?? (futureCurrentEnd ? currentPeriodEnd : now);
    const periodEnd = parseOptionalDate(input.periodEnd) ?? (0, billing_1.addMonths)(periodStart, 1);
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
    trialEndsAt: true,
    activatedAt: true,
    suspendedAt: true,
    createdAt: true,
    updatedAt: true,
    plan: { select: { id: true, code: true, name: true, monthlyPriceUzs: true } },
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
    note: true,
    createdAt: true,
    store: { select: { id: true, name: true, slug: true, status: true } },
    approvedBy: { select: { id: true, fullName: true, username: true } },
};
exports.PlatformService = {
    async dashboard() {
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
    async listStores(query) {
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
        return { items, total, page, pageSize };
    },
    async findStoreById(id) {
        const store = await prisma_1.prisma.store.findUnique({ where: { id }, select: storeListSelect });
        if (!store)
            throw new AppError_1.AppError(404, "Store not found");
        return store;
    },
    async updateStoreStatus(id, input, actor) {
        const store = await prisma_1.prisma.store.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!store)
            throw new AppError_1.AppError(404, "Store not found");
        return prisma_1.prisma.$transaction(async (tx) => {
            const updated = await tx.store.update({
                where: { id },
                data: {
                    status: input.status,
                    suspendedAt: input.status === client_1.StoreStatus.SUSPENDED ? new Date() : null,
                    ...(input.status === client_1.StoreStatus.ACTIVE && { activatedAt: new Date() }),
                },
                select: storeListSelect,
            });
            if (input.status === client_1.StoreStatus.PAST_DUE ||
                input.status === client_1.StoreStatus.SUSPENDED ||
                input.status === client_1.StoreStatus.CANCELLED) {
                await tx.subscription.updateMany({
                    where: { storeId: id },
                    data: { status: input.status },
                });
            }
            await tx.auditLog.create({
                data: {
                    storeId: id,
                    actorId: actor.id,
                    action: client_1.AuditAction.STORE_STATUS_CHANGED,
                    metadata: { from: store.status, to: input.status, note: input.note },
                },
            });
            return updated;
        }, prisma_1.transactionOptions);
    },
    async listPayments(status) {
        return prisma_1.prisma.payment.findMany({
            where: status ? { status } : undefined,
            select: paymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 200,
        });
    },
    async createPayment(input, actor) {
        const store = await prisma_1.prisma.store.findUnique({
            where: { id: input.storeId },
            select: {
                id: true,
                subscription: { select: { id: true, currentPeriodEnd: true } },
            },
        });
        if (!store || !store.subscription)
            throw new AppError_1.AppError(404, "Store subscription not found");
        const { periodStart, periodEnd } = resolvePaymentPeriod(store.subscription.currentPeriodEnd, input);
        return prisma_1.prisma.$transaction(async (tx) => {
            const payment = await tx.payment.create({
                data: {
                    storeId: store.id,
                    subscriptionId: store.subscription.id,
                    amount: input.amount,
                    currency: input.currency,
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
                    metadata: { paymentId: payment.id, amount: input.amount, currency: input.currency },
                },
            });
            return payment;
        }, prisma_1.transactionOptions);
    },
    async approvePayment(id, actor) {
        const payment = await prisma_1.prisma.payment.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                storeId: true,
                subscriptionId: true,
                periodStart: true,
                periodEnd: true,
                store: { select: { id: true } },
            },
        });
        if (!payment)
            throw new AppError_1.AppError(404, "Payment not found");
        if (payment.status !== client_1.PaymentStatus.PENDING)
            throw new AppError_1.AppError(409, "Only pending payments can be approved");
        if (!payment.subscriptionId || !payment.periodStart || !payment.periodEnd) {
            throw new AppError_1.AppError(409, "Payment period is incomplete");
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            await tx.subscription.update({
                where: { id: payment.subscriptionId },
                data: {
                    status: client_1.SubscriptionStatus.ACTIVE,
                    currentPeriodStart: payment.periodStart,
                    currentPeriodEnd: payment.periodEnd,
                    nextPaymentDueAt: payment.periodEnd,
                    lastPaymentAt: new Date(),
                },
            });
            await tx.store.update({
                where: { id: payment.storeId },
                data: {
                    status: client_1.StoreStatus.ACTIVE,
                    activatedAt: new Date(),
                    suspendedAt: null,
                },
            });
            const approved = await tx.payment.update({
                where: { id },
                data: {
                    status: client_1.PaymentStatus.APPROVED,
                    approvedAt: new Date(),
                    approvedById: actor.id,
                },
                select: paymentSelect,
            });
            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.PAYMENT_APPROVED,
                    metadata: { paymentId: payment.id, periodStart: payment.periodStart, periodEnd: payment.periodEnd },
                },
            });
            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.SUBSCRIPTION_EXTENDED,
                    metadata: { paymentId: payment.id, periodEnd: payment.periodEnd },
                },
            });
            return approved;
        }, prisma_1.transactionOptions);
    },
    async rejectPayment(id, input, actor) {
        const payment = await prisma_1.prisma.payment.findUnique({ where: { id }, select: { id: true, status: true, storeId: true } });
        if (!payment)
            throw new AppError_1.AppError(404, "Payment not found");
        if (payment.status !== client_1.PaymentStatus.PENDING)
            throw new AppError_1.AppError(409, "Only pending payments can be rejected");
        return prisma_1.prisma.$transaction(async (tx) => {
            const rejected = await tx.payment.update({
                where: { id },
                data: {
                    status: client_1.PaymentStatus.REJECTED,
                    rejectedAt: new Date(),
                    note: input.note,
                },
                select: paymentSelect,
            });
            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.PAYMENT_REJECTED,
                    metadata: { paymentId: payment.id, note: input.note },
                },
            });
            return rejected;
        }, prisma_1.transactionOptions);
    },
};
