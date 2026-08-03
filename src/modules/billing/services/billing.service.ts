import {
    AuditAction,
    PaymentStatus,
    StoreStatus,
    UserRole,
} from "@prisma/client";
import { addMonths } from "../../../core/config/billing";
import { AppError } from "../../../core/errors/AppError";
import { lockStore } from "../../../core/services/plan-limit.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { prepareReceipt } from "../../media/services/media.service";
import { SubmitTenantPaymentInput } from "../validations/billing.validation";

function requireStore(actor: JwtPayload): string {
    if (!actor.storeId) throw new AppError(403, "Store context is required");
    return actor.storeId;
}

function resolvePeriod(currentPeriodEnd: Date | null) {
    const now = new Date();
    const periodStart =
        currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
            ? currentPeriodEnd
            : now;
    return { periodStart, periodEnd: addMonths(periodStart, 1) };
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
} as const;

function serializePayment(payment: any) {
    return { ...payment, amount: Number(payment.amount) };
}

export const BillingService = {
    async summary(actor: JwtPayload) {
        const storeId = requireStore(actor);
        const store = await prisma.store.findUnique({
            where: { id: storeId },
            select: {
                id: true,
                name: true,
                status: true,
                trialEndsAt: true,
                plan: {
                    select: {
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
        if (!store) throw new AppError(404, "Store not found");

        return {
            ...store,
            plan: store.plan
                ? { ...store.plan, monthlyPriceUzs: Number(store.plan.monthlyPriceUzs) }
                : null,
        };
    },

    async listPayments(status: PaymentStatus | undefined, actor: JwtPayload) {
        const storeId = requireStore(actor);
        const payments = await prisma.payment.findMany({
            where: { storeId, ...(status && { status }) },
            select: tenantPaymentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 100,
        });
        return payments.map(serializePayment);
    },

    async submitPayment(input: SubmitTenantPaymentInput, actor: JwtPayload) {
        const storeId = requireStore(actor);
        if (actor.role !== UserRole.STORE_OWNER) {
            throw new AppError(403, "Only a store owner can submit subscription payments");
        }
        const receipt = prepareReceipt(input.receipt);

        const payment = await prisma.$transaction(async (tx) => {
            await lockStore(tx, storeId);
            const store = await tx.store.findUnique({
                where: { id: storeId },
                select: {
                    id: true,
                    status: true,
                    plan: { select: { code: true, monthlyPriceUzs: true } },
                    subscription: { select: { id: true, currentPeriodEnd: true } },
                },
            });
            if (!store?.subscription) throw new AppError(409, "Store subscription is not configured");
            if (!store.plan) throw new AppError(409, "Store plan is not configured");
            if (
                store.status === StoreStatus.SUSPENDED ||
                store.status === StoreStatus.CANCELLED
            ) {
                throw new AppError(409, "Blocked stores cannot submit a payment");
            }

            const amount = Number(store.plan.monthlyPriceUzs);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new AppError(409, "Store plan does not have a billable monthly price");
            }

            const pending = await tx.payment.findFirst({
                where: { storeId, status: PaymentStatus.PENDING },
                select: { id: true },
            });
            if (pending) throw new AppError(409, "A payment is already awaiting approval");

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
                    status: PaymentStatus.PENDING,
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
                    action: AuditAction.PAYMENT_CREATED,
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
        }, transactionOptions);

        return serializePayment(payment);
    },
};
