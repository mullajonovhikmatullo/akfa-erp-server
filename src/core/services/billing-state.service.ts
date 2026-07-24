import { StoreStatus, SubscriptionStatus } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { prisma } from "../../infrastructure/prisma/prisma";

export type StoreBillingState = {
    id: string;
    status: StoreStatus;
    subscription: {
        id: string;
        status: SubscriptionStatus;
        trialEndsAt: Date;
        currentPeriodEnd: Date | null;
    } | null;
};

function isPast(date: Date | null | undefined, now: Date): boolean {
    return Boolean(date && date.getTime() < now.getTime());
}

export async function refreshStoreBillingState(storeId: string): Promise<StoreBillingState> {
    const store = await prisma.store.findUnique({
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

    if (!store) throw new AppError(403, "Store account not found");
    if (!store.subscription) return store;
    if (store.status === StoreStatus.SUSPENDED || store.status === StoreStatus.CANCELLED) return store;

    const now = new Date();
    const trialExpired =
        store.subscription.status === SubscriptionStatus.TRIALING &&
        isPast(store.subscription.trialEndsAt, now);
    const paidPeriodExpired =
        store.subscription.status === SubscriptionStatus.ACTIVE &&
        isPast(store.subscription.currentPeriodEnd, now);

    if (!trialExpired && !paidPeriodExpired) return store;

    const updated = await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
            where: { id: store.subscription!.id },
            data: { status: SubscriptionStatus.PAST_DUE },
        });

        return tx.store.update({
            where: { id: store.id },
            data: { status: StoreStatus.PAST_DUE },
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

export function assertStoreReadable(state: StoreBillingState): void {
    if (state.status === StoreStatus.SUSPENDED || state.status === StoreStatus.CANCELLED) {
        throw new AppError(403, "Store account is not active");
    }
}

export function assertStoreWritable(state: StoreBillingState): void {
    assertStoreReadable(state);

    if (state.status === StoreStatus.PAST_DUE) {
        throw new AppError(402, "Subscription payment is required");
    }
}
