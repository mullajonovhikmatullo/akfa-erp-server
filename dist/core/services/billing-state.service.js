"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshStoreBillingState = refreshStoreBillingState;
exports.refreshDueBillingStates = refreshDueBillingStates;
exports.assertStoreReadable = assertStoreReadable;
exports.assertStoreWritable = assertStoreWritable;
exports.assertStoreReadableInTransaction = assertStoreReadableInTransaction;
exports.assertStoreWritableInTransaction = assertStoreWritableInTransaction;
const client_1 = require("@prisma/client");
const AppError_1 = require("../errors/AppError");
const prisma_1 = require("../../infrastructure/prisma/prisma");
const billing_policy_1 = require("./billing-policy");
const store_lock_service_1 = require("./store-lock.service");
const billingStateSelect = {
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
};
function toSubscriptionStatus(status) {
    return status;
}
async function refreshStoreBillingState(storeId) {
    const initial = await prisma_1.prisma.store.findUnique({
        where: { id: storeId },
        select: billingStateSelect,
    });
    if (!initial)
        throw new AppError_1.AppError(403, "Store account not found");
    if (!initial.subscription)
        return initial;
    const initialStatus = (0, billing_policy_1.resolveCoherentBillingStatus)(initial.status, initial.subscription);
    if (initial.status === initialStatus &&
        initial.subscription.status === toSubscriptionStatus(initialStatus)) {
        return initial;
    }
    return prisma_1.prisma.$transaction(async (tx) => {
        await (0, store_lock_service_1.lockStore)(tx, storeId);
        const current = await tx.store.findUnique({
            where: { id: storeId },
            select: billingStateSelect,
        });
        if (!current)
            throw new AppError_1.AppError(403, "Store account not found");
        if (!current.subscription)
            return current;
        const nextStatus = (0, billing_policy_1.resolveCoherentBillingStatus)(current.status, current.subscription);
        const nextSubscriptionStatus = toSubscriptionStatus(nextStatus);
        if (current.subscription.status !== nextSubscriptionStatus) {
            await tx.subscription.update({
                where: { id: current.subscription.id },
                data: { status: nextSubscriptionStatus },
            });
        }
        if (current.status !== nextStatus) {
            await tx.store.update({
                where: { id: storeId },
                data: {
                    status: nextStatus,
                    billingVersion: { increment: 1 },
                    suspendedAt: nextStatus === client_1.StoreStatus.SUSPENDED ? new Date() : current.status === client_1.StoreStatus.SUSPENDED ? null : undefined,
                },
            });
        }
        if (nextStatus === client_1.StoreStatus.CANCELLED) {
            await tx.user.updateMany({
                where: { storeId, isActive: true },
                data: { isActive: false, authVersion: { increment: 1 } },
            });
            await tx.authHandoff.updateMany({
                where: { user: { storeId }, usedAt: null },
                data: { usedAt: new Date() },
            });
        }
        return tx.store.findUniqueOrThrow({
            where: { id: storeId },
            select: billingStateSelect,
        });
    }, prisma_1.transactionOptions);
}
async function refreshDueBillingStates(limit = 200) {
    const now = new Date();
    const dueStores = await prisma_1.prisma.store.findMany({
        where: {
            status: { in: [client_1.StoreStatus.TRIALING, client_1.StoreStatus.ACTIVE] },
            OR: [
                {
                    subscription: {
                        is: {
                            status: client_1.SubscriptionStatus.TRIALING,
                            trialEndsAt: { lte: now },
                        },
                    },
                },
                {
                    subscription: {
                        is: {
                            status: client_1.SubscriptionStatus.ACTIVE,
                            OR: [
                                { currentPeriodEnd: null },
                                { currentPeriodEnd: { lte: now } },
                            ],
                        },
                    },
                },
            ],
        },
        select: { id: true },
        take: Math.max(1, Math.min(limit, 1000)),
    });
    await Promise.all(dueStores.map((store) => refreshStoreBillingState(store.id)));
}
function assertStoreReadable(state) {
    if (!state.subscription) {
        throw new AppError_1.AppError(403, "Store subscription is not configured");
    }
    if (state.status === client_1.StoreStatus.SUSPENDED ||
        state.status === client_1.StoreStatus.CANCELLED ||
        state.subscription.status === client_1.SubscriptionStatus.SUSPENDED ||
        state.subscription.status === client_1.SubscriptionStatus.CANCELLED) {
        throw new AppError_1.AppError(403, "Store account is not active");
    }
    if (state.status === client_1.StoreStatus.PAST_DUE &&
        state.subscription.status === client_1.SubscriptionStatus.PAST_DUE) {
        return;
    }
    if (state.status === client_1.StoreStatus.TRIALING &&
        state.subscription.status === client_1.SubscriptionStatus.TRIALING &&
        (0, billing_policy_1.hasValidTrial)(state.subscription)) {
        return;
    }
    if (state.status === client_1.StoreStatus.ACTIVE &&
        state.subscription.status === client_1.SubscriptionStatus.ACTIVE &&
        (0, billing_policy_1.hasValidPaidPeriod)(state.subscription)) {
        return;
    }
    throw new AppError_1.AppError(403, "Store billing state is inconsistent");
}
function assertStoreWritable(state) {
    assertStoreReadable(state);
    if (state.status === client_1.StoreStatus.PAST_DUE ||
        state.subscription?.status === client_1.SubscriptionStatus.PAST_DUE) {
        throw new AppError_1.AppError(402, "Subscription payment is required");
    }
}
async function readLockedStoreBillingState(tx, storeId) {
    await (0, store_lock_service_1.lockStore)(tx, storeId);
    const current = await tx.store.findUnique({
        where: { id: storeId },
        select: billingStateSelect,
    });
    if (!current)
        throw new AppError_1.AppError(403, "Store account not found");
    return current;
}
async function assertStoreReadableInTransaction(tx, storeId) {
    const current = await readLockedStoreBillingState(tx, storeId);
    assertStoreReadable(current);
}
async function assertStoreWritableInTransaction(tx, storeId) {
    const current = await readLockedStoreBillingState(tx, storeId);
    assertStoreWritable(current);
}
