import { StoreStatus, SubscriptionStatus } from "@prisma/client";

export type SubscriptionPolicySnapshot = {
    status: SubscriptionStatus;
    trialEndsAt: Date;
    currentPeriodEnd: Date | null;
};

function isFuture(date: Date | null | undefined, now: Date): boolean {
    return Boolean(date && date.getTime() > now.getTime());
}

export function hasValidTrial(subscription: SubscriptionPolicySnapshot, now = new Date()): boolean {
    return isFuture(subscription.trialEndsAt, now);
}

export function hasValidPaidPeriod(subscription: SubscriptionPolicySnapshot, now = new Date()): boolean {
    return isFuture(subscription.currentPeriodEnd, now);
}

export function resolveCoherentBillingStatus(
    storeStatus: StoreStatus,
    subscription: SubscriptionPolicySnapshot,
    now = new Date()
): StoreStatus {
    if (
        storeStatus === StoreStatus.CANCELLED ||
        subscription.status === SubscriptionStatus.CANCELLED
    ) {
        return StoreStatus.CANCELLED;
    }

    if (
        storeStatus === StoreStatus.SUSPENDED ||
        subscription.status === SubscriptionStatus.SUSPENDED
    ) {
        return StoreStatus.SUSPENDED;
    }

    if (
        storeStatus === StoreStatus.PAST_DUE ||
        subscription.status === SubscriptionStatus.PAST_DUE
    ) {
        return StoreStatus.PAST_DUE;
    }

    if (subscription.status === SubscriptionStatus.TRIALING) {
        return hasValidTrial(subscription, now) ? StoreStatus.TRIALING : StoreStatus.PAST_DUE;
    }

    if (subscription.status === SubscriptionStatus.ACTIVE) {
        return hasValidPaidPeriod(subscription, now) ? StoreStatus.ACTIVE : StoreStatus.PAST_DUE;
    }

    return StoreStatus.PAST_DUE;
}

export function allowedManualTransitions(
    currentStatus: StoreStatus,
    subscription: SubscriptionPolicySnapshot,
    now = new Date()
): StoreStatus[] {
    if (currentStatus === StoreStatus.CANCELLED) {
        // Cancellation disables access, but a paid period or an unexpired trial
        // can be restored by the platform owner without creating a new tenant.
        if (hasValidPaidPeriod(subscription, now)) return [StoreStatus.ACTIVE];
        if (hasValidTrial(subscription, now)) return [StoreStatus.TRIALING];
        return [];
    }

    const allowed = new Set<StoreStatus>();
    if (currentStatus !== StoreStatus.PAST_DUE) allowed.add(StoreStatus.PAST_DUE);
    if (currentStatus !== StoreStatus.SUSPENDED) allowed.add(StoreStatus.SUSPENDED);
    allowed.add(StoreStatus.CANCELLED);

    if (currentStatus === StoreStatus.SUSPENDED) {
        if (hasValidPaidPeriod(subscription, now)) {
            allowed.add(StoreStatus.ACTIVE);
        } else if (hasValidTrial(subscription, now)) {
            allowed.add(StoreStatus.TRIALING);
        }
    }

    return [...allowed];
}
