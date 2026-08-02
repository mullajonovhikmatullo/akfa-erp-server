"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const client_1 = require("@prisma/client");
const billing_1 = require("../../../core/config/billing");
const AppError_1 = require("../../../core/errors/AppError");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const media_service_1 = require("../../media/services/media.service");
function requireStore(actor) {
    if (!actor.storeId)
        throw new AppError_1.AppError(403, "Store context is required");
    return actor.storeId;
}
function resolvePeriod(currentPeriodEnd) {
    const now = new Date();
    const periodStart = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
        ? currentPeriodEnd
        : now;
    return { periodStart, periodEnd: (0, billing_1.addMonths)(periodStart, 1) };
}
const tenantPaymentSelect = {
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
    branch: { select: { id: true, name: true } },
    receiptMedia: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    },
};
function serializePayment(payment) {
    return { ...payment, amount: Number(payment.amount) };
}
exports.BillingService = {
    async summary(actor) {
        const storeId = requireStore(actor);
        const store = await prisma_1.prisma.store.findUnique({
            where: { id: storeId },
            select: {
                id: true,
                name: true,
                status: true,
                trialEndsAt: true,
                plan: {
                    select: { code: true, name: true, monthlyPriceUzs: true },
                },
                subscription: {
                    select: {
                        status: true,
                        trialEndsAt: true,
                        currentPeriodStart: true,
                        currentPeriodEnd: true,
                        nextPaymentDueAt: true,
                    },
                },
                branches: {
                    select: { id: true, name: true },
                    orderBy: { name: "asc" },
                },
            },
        });
        if (!store)
            throw new AppError_1.AppError(404, "Store not found");
        return {
            ...store,
            plan: store.plan
                ? { ...store.plan, monthlyPriceUzs: Number(store.plan.monthlyPriceUzs) }
                : null,
        };
    },
    async listPayments(status, actor) {
        const storeId = requireStore(actor);
        const payments = await prisma_1.prisma.payment.findMany({
            where: { storeId, ...(status && { status }) },
            select: tenantPaymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 100,
        });
        return payments.map(serializePayment);
    },
    async submitPayment(input, actor) {
        const storeId = requireStore(actor);
        if (actor.role !== client_1.UserRole.STORE_OWNER) {
            throw new AppError_1.AppError(403, "Only a store owner can submit subscription payments");
        }
        const receipt = (0, media_service_1.prepareReceipt)(input.receipt);
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.lockStore)(tx, storeId);
            const store = await tx.store.findUnique({
                where: { id: storeId },
                select: {
                    id: true,
                    status: true,
                    plan: { select: { code: true, monthlyPriceUzs: true } },
                    subscription: { select: { id: true, currentPeriodEnd: true } },
                },
            });
            if (!store?.subscription)
                throw new AppError_1.AppError(409, "Store subscription is not configured");
            if (!store.plan)
                throw new AppError_1.AppError(409, "Store plan is not configured");
            if (store.status === client_1.StoreStatus.SUSPENDED ||
                store.status === client_1.StoreStatus.CANCELLED) {
                throw new AppError_1.AppError(409, "Blocked stores cannot submit a payment");
            }
            const amount = Number(store.plan.monthlyPriceUzs);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new AppError_1.AppError(409, "Store plan does not have a billable monthly price");
            }
            const pending = await tx.payment.findFirst({
                where: { storeId, status: client_1.PaymentStatus.PENDING },
                select: { id: true },
            });
            if (pending)
                throw new AppError_1.AppError(409, "A payment is already awaiting approval");
            const media = await tx.mediaObject.create({
                data: {
                    storeId,
                    uploadedById: actor.id,
                    ...receipt,
                },
                select: { id: true },
            });
            const { periodStart, periodEnd } = resolvePeriod(store.subscription.currentPeriodEnd);
            const created = await tx.payment.create({
                data: {
                    storeId,
                    subscriptionId: store.subscription.id,
                    submittedById: actor.id,
                    receiptMediaId: media.id,
                    amount,
                    currency: "UZS",
                    status: client_1.PaymentStatus.PENDING,
                    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
                    periodStart,
                    periodEnd,
                    note: input.note,
                },
                select: tenantPaymentSelect,
            });
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: actor.id,
                    action: client_1.AuditAction.PAYMENT_CREATED,
                    metadata: {
                        paymentId: created.id,
                        amount,
                        currency: "UZS",
                        planCode: store.plan.code,
                        receiptMediaId: media.id,
                        periodStart,
                        periodEnd,
                    },
                },
            });
            return created;
        }, prisma_1.transactionOptions);
        return serializePayment(payment);
    },
};
