"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasValidTrial = hasValidTrial;
exports.hasValidPaidPeriod = hasValidPaidPeriod;
exports.resolveCoherentBillingStatus = resolveCoherentBillingStatus;
exports.allowedManualTransitions = allowedManualTransitions;
const client_1 = require("@prisma/client");
function isFuture(date, now) {
    return Boolean(date && date.getTime() > now.getTime());
}
function hasValidTrial(subscription, now = new Date()) {
    return isFuture(subscription.trialEndsAt, now);
}
function hasValidPaidPeriod(subscription, now = new Date()) {
    return isFuture(subscription.currentPeriodEnd, now);
}
function resolveCoherentBillingStatus(storeStatus, subscription, now = new Date()) {
    if (storeStatus === client_1.StoreStatus.CANCELLED ||
        subscription.status === client_1.SubscriptionStatus.CANCELLED) {
        return client_1.StoreStatus.CANCELLED;
    }
    if (storeStatus === client_1.StoreStatus.SUSPENDED ||
        subscription.status === client_1.SubscriptionStatus.SUSPENDED) {
        return client_1.StoreStatus.SUSPENDED;
    }
    if (storeStatus === client_1.StoreStatus.PAST_DUE ||
        subscription.status === client_1.SubscriptionStatus.PAST_DUE) {
        return client_1.StoreStatus.PAST_DUE;
    }
    if (subscription.status === client_1.SubscriptionStatus.TRIALING) {
        return hasValidTrial(subscription, now) ? client_1.StoreStatus.TRIALING : client_1.StoreStatus.PAST_DUE;
    }
    if (subscription.status === client_1.SubscriptionStatus.ACTIVE) {
        return hasValidPaidPeriod(subscription, now) ? client_1.StoreStatus.ACTIVE : client_1.StoreStatus.PAST_DUE;
    }
    return client_1.StoreStatus.PAST_DUE;
}
function allowedManualTransitions(currentStatus, subscription, now = new Date()) {
    if (currentStatus === client_1.StoreStatus.CANCELLED) {
        // Cancellation disables access, but a paid period or an unexpired trial
        // can be restored by the platform owner without creating a new tenant.
        if (hasValidPaidPeriod(subscription, now))
            return [client_1.StoreStatus.ACTIVE];
        if (hasValidTrial(subscription, now))
            return [client_1.StoreStatus.TRIALING];
        return [];
    }
    const allowed = new Set();
    if (currentStatus !== client_1.StoreStatus.PAST_DUE)
        allowed.add(client_1.StoreStatus.PAST_DUE);
    if (currentStatus !== client_1.StoreStatus.SUSPENDED)
        allowed.add(client_1.StoreStatus.SUSPENDED);
    allowed.add(client_1.StoreStatus.CANCELLED);
    if (currentStatus === client_1.StoreStatus.SUSPENDED) {
        if (hasValidPaidPeriod(subscription, now)) {
            allowed.add(client_1.StoreStatus.ACTIVE);
        }
        else if (hasValidTrial(subscription, now)) {
            allowed.add(client_1.StoreStatus.TRIALING);
        }
    }
    return [...allowed];
}
