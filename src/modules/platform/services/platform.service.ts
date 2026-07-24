import { AuditAction, PaymentStatus, StoreStatus, SubscriptionStatus } from "@prisma/client";
import { addMonths } from "../../../core/config/billing";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import {
    CreatePaymentInput,
    ListStoresQuery,
    RejectPaymentInput,
    UpdateStoreStatusInput,
} from "../validations/platform.validation";

function parseOptionalDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
}

function resolvePaymentPeriod(currentPeriodEnd: Date | null, input: CreatePaymentInput) {
    const now = new Date();
    const futureCurrentEnd = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime();
    const periodStart = parseOptionalDate(input.periodStart) ?? (futureCurrentEnd ? currentPeriodEnd : now);
    const periodEnd = parseOptionalDate(input.periodEnd) ?? addMonths(periodStart, 1);
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
    note: true,
    createdAt: true,
    store: { select: { id: true, name: true, slug: true, status: true } },
    approvedBy: { select: { id: true, fullName: true, username: true } },
} as const;

export const PlatformService = {
    async dashboard() {
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

    async listStores(query: ListStoresQuery) {
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

        return { items, total, page, pageSize };
    },

    async findStoreById(id: string) {
        const store = await prisma.store.findUnique({ where: { id }, select: storeListSelect });
        if (!store) throw new AppError(404, "Store not found");
        return store;
    },

    async updateStoreStatus(id: string, input: UpdateStoreStatusInput, actor: JwtPayload) {
        const store = await prisma.store.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!store) throw new AppError(404, "Store not found");

        return prisma.$transaction(async (tx) => {
            const updated = await tx.store.update({
                where: { id },
                data: {
                    status: input.status,
                    suspendedAt: input.status === StoreStatus.SUSPENDED ? new Date() : null,
                    ...(input.status === StoreStatus.ACTIVE && { activatedAt: new Date() }),
                },
                select: storeListSelect,
            });

            if (
                input.status === StoreStatus.PAST_DUE ||
                input.status === StoreStatus.SUSPENDED ||
                input.status === StoreStatus.CANCELLED
            ) {
                await tx.subscription.updateMany({
                    where: { storeId: id },
                    data: { status: input.status as any },
                });
            }

            await tx.auditLog.create({
                data: {
                    storeId: id,
                    actorId: actor.id,
                    action: AuditAction.STORE_STATUS_CHANGED,
                    metadata: { from: store.status, to: input.status, note: input.note },
                },
            });

            return updated;
        }, transactionOptions);
    },

    async listPayments(status?: PaymentStatus) {
        return prisma.payment.findMany({
            where: status ? { status } : undefined,
            select: paymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 200,
        });
    },

    async createPayment(input: CreatePaymentInput, actor: JwtPayload) {
        const store = await prisma.store.findUnique({
            where: { id: input.storeId },
            select: {
                id: true,
                subscription: { select: { id: true, currentPeriodEnd: true } },
            },
        });
        if (!store || !store.subscription) throw new AppError(404, "Store subscription not found");

        const { periodStart, periodEnd } = resolvePaymentPeriod(store.subscription.currentPeriodEnd, input);

        return prisma.$transaction(async (tx) => {
            const payment = await tx.payment.create({
                data: {
                    storeId: store.id,
                    subscriptionId: store.subscription!.id,
                    amount: input.amount,
                    currency: input.currency,
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
                    metadata: { paymentId: payment.id, amount: input.amount, currency: input.currency },
                },
            });

            return payment;
        }, transactionOptions);
    },

    async approvePayment(id: string, actor: JwtPayload) {
        const payment = await prisma.payment.findUnique({
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
        if (!payment) throw new AppError(404, "Payment not found");
        if (payment.status !== PaymentStatus.PENDING) throw new AppError(409, "Only pending payments can be approved");
        if (!payment.subscriptionId || !payment.periodStart || !payment.periodEnd) {
            throw new AppError(409, "Payment period is incomplete");
        }

        return prisma.$transaction(async (tx) => {
            await tx.subscription.update({
                where: { id: payment.subscriptionId! },
                data: {
                    status: SubscriptionStatus.ACTIVE,
                    currentPeriodStart: payment.periodStart,
                    currentPeriodEnd: payment.periodEnd,
                    nextPaymentDueAt: payment.periodEnd,
                    lastPaymentAt: new Date(),
                },
            });

            await tx.store.update({
                where: { id: payment.storeId },
                data: {
                    status: StoreStatus.ACTIVE,
                    activatedAt: new Date(),
                    suspendedAt: null,
                },
            });

            const approved = await tx.payment.update({
                where: { id },
                data: {
                    status: PaymentStatus.APPROVED,
                    approvedAt: new Date(),
                    approvedById: actor.id,
                },
                select: paymentSelect,
            });

            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: AuditAction.PAYMENT_APPROVED,
                    metadata: { paymentId: payment.id, periodStart: payment.periodStart, periodEnd: payment.periodEnd },
                },
            });

            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: AuditAction.SUBSCRIPTION_EXTENDED,
                    metadata: { paymentId: payment.id, periodEnd: payment.periodEnd },
                },
            });

            return approved;
        }, transactionOptions);
    },

    async rejectPayment(id: string, input: RejectPaymentInput, actor: JwtPayload) {
        const payment = await prisma.payment.findUnique({ where: { id }, select: { id: true, status: true, storeId: true } });
        if (!payment) throw new AppError(404, "Payment not found");
        if (payment.status !== PaymentStatus.PENDING) throw new AppError(409, "Only pending payments can be rejected");

        return prisma.$transaction(async (tx) => {
            const rejected = await tx.payment.update({
                where: { id },
                data: {
                    status: PaymentStatus.REJECTED,
                    rejectedAt: new Date(),
                    note: input.note,
                },
                select: paymentSelect,
            });

            await tx.auditLog.create({
                data: {
                    storeId: payment.storeId,
                    actorId: actor.id,
                    action: AuditAction.PAYMENT_REJECTED,
                    metadata: { paymentId: payment.id, note: input.note },
                },
            });

            return rejected;
        }, transactionOptions);
    },
};
