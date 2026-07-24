"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshStoreBillingState = refreshStoreBillingState;
exports.assertStoreReadable = assertStoreReadable;
exports.assertStoreWritable = assertStoreWritable;
const client_1 = require("@prisma/client");
const AppError_1 = require("../errors/AppError");
const prisma_1 = require("../../infrastructure/prisma/prisma");
function isPast(date, now) {
    return Boolean(date && date.getTime() < now.getTime());
}
async function refreshStoreBillingState(storeId) {
    const store = await prisma_1.prisma.store.findUnique({
        where: { id: storeId },
        select: {
            id: true,
            status: true,
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
        throw new AppError_1.AppError(403, "Store account not found");
    if (!store.subscription)
        return store;
    if (store.status === client_1.StoreStatus.SUSPENDED || store.status === client_1.StoreStatus.CANCELLED)
        return store;
    const now = new Date();
    const trialExpired = store.subscription.status === client_1.SubscriptionStatus.TRIALING &&
        isPast(store.subscription.trialEndsAt, now);
    const paidPeriodExpired = store.subscription.status === client_1.SubscriptionStatus.ACTIVE &&
        isPast(store.subscription.currentPeriodEnd, now);
    if (!trialExpired && !paidPeriodExpired)
        return store;
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
            where: { id: store.subscription.id },
            data: { status: client_1.SubscriptionStatus.PAST_DUE },
        });
        return tx.store.update({
            where: { id: store.id },
            data: { status: client_1.StoreStatus.PAST_DUE },
            select: {
                id: true,
                status: true,
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
    });
    return updated;
}
function assertStoreReadable(state) {
    if (state.status === client_1.StoreStatus.SUSPENDED || state.status === client_1.StoreStatus.CANCELLED) {
        throw new AppError_1.AppError(403, "Store account is not active");
    }
}
function assertStoreWritable(state) {
    assertStoreReadable(state);
    if (state.status === client_1.StoreStatus.PAST_DUE) {
        throw new AppError_1.AppError(402, "Subscription payment is required");
    }
}
