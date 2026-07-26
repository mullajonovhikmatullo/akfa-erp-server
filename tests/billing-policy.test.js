const test = require("node:test");
const assert = require("node:assert/strict");
const { StoreStatus, SubscriptionStatus } = require("@prisma/client");
const {
    allowedManualTransitions,
    resolveCoherentBillingStatus,
} = require("../dist/core/services/billing-policy");
const {
    assertStoreWritableInTransaction,
} = require("../dist/core/services/billing-state.service");

const now = new Date("2026-07-25T12:00:00.000Z");
const future = new Date("2026-08-25T12:00:00.000Z");
const past = new Date("2026-06-25T12:00:00.000Z");

function subscription(status, trialEndsAt = future, currentPeriodEnd = future) {
    return { status, trialEndsAt, currentPeriodEnd };
}

test("cancelled status is terminal even when the other billing record says active", () => {
    assert.equal(
        resolveCoherentBillingStatus(
            StoreStatus.ACTIVE,
            subscription(SubscriptionStatus.CANCELLED),
            now
        ),
        StoreStatus.CANCELLED
    );
    assert.equal(
        resolveCoherentBillingStatus(
            StoreStatus.CANCELLED,
            subscription(SubscriptionStatus.ACTIVE),
            now
        ),
        StoreStatus.CANCELLED
    );
});

test("expired or incomplete paid periods become past due", () => {
    assert.equal(
        resolveCoherentBillingStatus(
            StoreStatus.ACTIVE,
            subscription(SubscriptionStatus.ACTIVE, future, past),
            now
        ),
        StoreStatus.PAST_DUE
    );
    assert.equal(
        resolveCoherentBillingStatus(
            StoreStatus.ACTIVE,
            subscription(SubscriptionStatus.ACTIVE, future, null),
            now
        ),
        StoreStatus.PAST_DUE
    );
});

test("expired trials become past due", () => {
    assert.equal(
        resolveCoherentBillingStatus(
            StoreStatus.TRIALING,
            subscription(SubscriptionStatus.TRIALING, past, null),
            now
        ),
        StoreStatus.PAST_DUE
    );
});

test("cancelled stores can recover during a valid paid period or trial", () => {
    assert.deepEqual(
        allowedManualTransitions(
            StoreStatus.CANCELLED,
            subscription(SubscriptionStatus.CANCELLED),
            now
        ),
        [StoreStatus.ACTIVE]
    );
    assert.deepEqual(
        allowedManualTransitions(
            StoreStatus.CANCELLED,
            subscription(SubscriptionStatus.CANCELLED, future, null),
            now
        ),
        [StoreStatus.TRIALING]
    );
    assert.deepEqual(
        allowedManualTransitions(
            StoreStatus.CANCELLED,
            subscription(SubscriptionStatus.CANCELLED, past, past),
            now
        ),
        []
    );
});

test("only a suspended store with an unexpired paid period can resume active", () => {
    const valid = allowedManualTransitions(
        StoreStatus.SUSPENDED,
        subscription(SubscriptionStatus.SUSPENDED, past, future),
        now
    );
    assert.ok(valid.includes(StoreStatus.ACTIVE));

    const expired = allowedManualTransitions(
        StoreStatus.SUSPENDED,
        subscription(SubscriptionStatus.SUSPENDED, past, past),
        now
    );
    assert.ok(!expired.includes(StoreStatus.ACTIVE));
});

test("past-due stores cannot bypass payment by manually becoming active", () => {
    const allowed = allowedManualTransitions(
        StoreStatus.PAST_DUE,
        subscription(SubscriptionStatus.PAST_DUE, past, past),
        now
    );
    assert.ok(!allowed.includes(StoreStatus.ACTIVE));
    assert.ok(allowed.includes(StoreStatus.CANCELLED));
});

test("locked tenant mutations reject cancelled and past-due billing snapshots", async () => {
    const txFor = (storeStatus, subscriptionStatus) => ({
        $queryRaw: async () => [{ id: "store-1" }],
        store: {
            findUnique: async () => ({
                id: "store-1",
                status: storeStatus,
                billingVersion: 7,
                subscription: {
                    id: "subscription-1",
                    status: subscriptionStatus,
                    trialEndsAt: future,
                    currentPeriodEnd: future,
                },
            }),
        },
    });

    await assert.rejects(
        () =>
            assertStoreWritableInTransaction(
                txFor(StoreStatus.CANCELLED, SubscriptionStatus.CANCELLED),
                "store-1"
            ),
        (error) => error.statusCode === 403
    );
    await assert.rejects(
        () =>
            assertStoreWritableInTransaction(
                txFor(StoreStatus.PAST_DUE, SubscriptionStatus.PAST_DUE),
                "store-1"
            ),
        (error) => error.statusCode === 402
    );
    await assert.doesNotReject(() =>
        assertStoreWritableInTransaction(
            txFor(StoreStatus.ACTIVE, SubscriptionStatus.ACTIVE),
            "store-1"
        )
    );
});
