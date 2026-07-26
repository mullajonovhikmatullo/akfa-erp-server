import { Prisma, StoreStatus, SubscriptionStatus } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { prisma, transactionOptions } from "../../infrastructure/prisma/prisma";
import {
    hasValidPaidPeriod,
    hasValidTrial,
    resolveCoherentBillingStatus,
} from "./billing-policy";
import { lockStore } from "./store-lock.service";

export type StoreBillingState = {
    id: string;
    status: StoreStatus;
    billingVersion: number;
    subscription: {
        id: string;
        status: SubscriptionStatus;
        trialEndsAt: Date;
        currentPeriodEnd: Date | null;
    } | null;
};

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
} as const;

function toSubscriptionStatus(status: StoreStatus): SubscriptionStatus {
    return status as unknown as SubscriptionStatus;
}

export async function refreshStoreBillingState(storeId: string): Promise<StoreBillingState> {
    const initial = await prisma.store.findUnique({
        where: { id: storeId },
        select: billingStateSelect,
    });

    if (!initial) throw new AppError(403, "Store account not found");
    if (!initial.subscription) return initial;

    const initialStatus = resolveCoherentBillingStatus(initial.status, initial.subscription);
    if (
        initial.status === initialStatus &&
        initial.subscription.status === toSubscriptionStatus(initialStatus)
    ) {
        return initial;
    }

    return prisma.$transaction(async (tx) => {
        await lockStore(tx, storeId);
        const current = await tx.store.findUnique({
            where: { id: storeId },
            select: billingStateSelect,
        });

        if (!current) throw new AppError(403, "Store account not found");
        if (!current.subscription) return current;

        const nextStatus = resolveCoherentBillingStatus(current.status, current.subscription);
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
                    suspendedAt: nextStatus === StoreStatus.SUSPENDED ? new Date() : current.status === StoreStatus.SUSPENDED ? null : undefined,
                },
            });
        }

        if (nextStatus === StoreStatus.CANCELLED) {
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
    }, transactionOptions);
}

export async function refreshDueBillingStates(limit = 200): Promise<void> {
    const now = new Date();
    const dueStores = await prisma.store.findMany({
        where: {
            status: { in: [StoreStatus.TRIALING, StoreStatus.ACTIVE] },
            OR: [
                {
                    subscription: {
                        is: {
                            status: SubscriptionStatus.TRIALING,
                            trialEndsAt: { lte: now },
                        },
                    },
                },
                {
                    subscription: {
                        is: {
                            status: SubscriptionStatus.ACTIVE,
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

export function assertStoreReadable(state: StoreBillingState): void {
    if (!state.subscription) {
        throw new AppError(403, "Store subscription is not configured");
    }

    if (
        state.status === StoreStatus.SUSPENDED ||
        state.status === StoreStatus.CANCELLED ||
        state.subscription.status === SubscriptionStatus.SUSPENDED ||
        state.subscription.status === SubscriptionStatus.CANCELLED
    ) {
        throw new AppError(403, "Store account is not active");
    }

    if (
        state.status === StoreStatus.PAST_DUE &&
        state.subscription.status === SubscriptionStatus.PAST_DUE
    ) {
        return;
    }

    if (
        state.status === StoreStatus.TRIALING &&
        state.subscription.status === SubscriptionStatus.TRIALING &&
        hasValidTrial(state.subscription)
    ) {
        return;
    }

    if (
        state.status === StoreStatus.ACTIVE &&
        state.subscription.status === SubscriptionStatus.ACTIVE &&
        hasValidPaidPeriod(state.subscription)
    ) {
        return;
    }

    throw new AppError(403, "Store billing state is inconsistent");
}

export function assertStoreWritable(state: StoreBillingState): void {
    assertStoreReadable(state);

    if (
        state.status === StoreStatus.PAST_DUE ||
        state.subscription?.status === SubscriptionStatus.PAST_DUE
    ) {
        throw new AppError(402, "Subscription payment is required");
    }
}

async function readLockedStoreBillingState(
    tx: Prisma.TransactionClient,
    storeId: string
): Promise<StoreBillingState> {
    await lockStore(tx, storeId);

    const current = await tx.store.findUnique({
        where: { id: storeId },
        select: billingStateSelect,
    });

    if (!current) throw new AppError(403, "Store account not found");
    return current;
}

export async function assertStoreReadableInTransaction(
    tx: Prisma.TransactionClient,
    storeId: string
): Promise<void> {
    const current = await readLockedStoreBillingState(tx, storeId);
    assertStoreReadable(current);
}

export async function assertStoreWritableInTransaction(
    tx: Prisma.TransactionClient,
    storeId: string
): Promise<void> {
    const current = await readLockedStoreBillingState(tx, storeId);
    assertStoreWritable(current);
}
