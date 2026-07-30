const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBranchSchema,
    updateBranchSchema,
} = require("../dist/modules/branches/validations/branch.validation");
const {
    registerStoreSchema,
} = require("../dist/modules/onboarding/validations/onboarding.validation");
const {
    createPaymentSchema,
    createPlanSchema,
    deletePlanSchema,
    regenerateOwnerSetupSchema,
    updateStoreStatusSchema,
} = require("../dist/modules/platform/validations/platform.validation");
const {
    createAdminSchema,
} = require("../dist/modules/admins/validations/admin.validation");
const {
    hashHandoffCode,
    getHandoffExpiry,
} = require("../dist/core/services/auth-handoff.service");
const {
    submitTenantPaymentSchema,
} = require("../dist/modules/billing/validations/billing.validation");
const {
    prepareReceipt,
} = require("../dist/modules/media/services/media.service");
const { HandoffPurpose } = require("@prisma/client");

test("branch schemas reject tenant overrides and nested Prisma writes", () => {
    assert.equal(createBranchSchema.safeParse({ name: "Main", storeId: "other" }).success, false);
    assert.equal(
        updateBranchSchema.safeParse({
            users: {
                update: {
                    where: { id: "user-id" },
                    data: { role: "PLATFORM_OWNER", storeId: null },
                },
            },
        }).success,
        false
    );
});

test("public onboarding accepts dynamic plan codes and rejects malformed input", () => {
    const base = {
        storeName: "Secure Store",
        ownerName: "Store Owner",
        phone: "+998901234567",
        username: "secure_owner",
        password: "long-password",
        confirmPassword: "long-password",
    };

    assert.equal(registerStoreSchema.safeParse({ ...base, planCode: "NETWORK" }).success, true);
    assert.equal(registerStoreSchema.safeParse({ ...base, planCode: "../NETWORK" }).success, false);
    assert.equal(registerStoreSchema.safeParse({ ...base, password: "123456", confirmPassword: "123456" }).success, true);
    assert.equal(registerStoreSchema.safeParse({ ...base, password: "12345", confirmPassword: "12345" }).success, false);
    assert.equal(registerStoreSchema.safeParse({ ...base, confirmPassword: "different-password" }).success, false);
    assert.equal(registerStoreSchema.safeParse({ ...base, planCode: "START" }).success, true);
});

test("plan mutations enforce public pricing and step-up deletion", () => {
    const base = {
        code: "PROFESSIONAL",
        name: "Professional",
        monthlyPriceUzs: 599000,
        maxBranches: 10,
        maxUsers: 50,
        maxProducts: null,
        isPublic: true,
        isActive: true,
    };

    assert.equal(createPlanSchema.safeParse(base).success, true);
    assert.equal(
        createPlanSchema.safeParse({ ...base, monthlyPriceUzs: 0 }).success,
        false
    );
    assert.equal(
        createPlanSchema.safeParse({ ...base, code: "bad-code" }).success,
        false
    );
    assert.equal(
        deletePlanSchema.safeParse({
            expectedVersion: 0,
            currentPassword: "platform-owner-password",
        }).success,
        true
    );
    assert.equal(deletePlanSchema.safeParse({ expectedVersion: 0 }).success, false);
});

test("cancellation requires reason, confirmation and optimistic version", () => {
    assert.equal(
        updateStoreStatusSchema.safeParse({ status: "CANCELLED", expectedVersion: 0 }).success,
        false
    );
    assert.equal(
        updateStoreStatusSchema.safeParse({
            status: "CANCELLED",
            expectedVersion: 0,
            note: "Owner requested closure",
            confirmation: "Secure Store",
        }).success,
        false
    );
    assert.equal(
        updateStoreStatusSchema.safeParse({
            status: "CANCELLED",
            expectedVersion: 0,
            note: "Owner requested closure",
            confirmation: "Secure Store",
            currentPassword: "platform-owner-password",
        }).success,
        true
    );
});

test("manual payments cannot choose foreign currency or billing period", () => {
    const base = {
        storeId: "0f7683fb-7c0a-40b6-a7d1-e3548231b789",
        amount: 399000,
        currency: "UZS",
    };

    assert.equal(createPaymentSchema.safeParse(base).success, true);
    assert.equal(createPaymentSchema.safeParse({ ...base, currency: "USD" }).success, false);
    assert.equal(
        createPaymentSchema.safeParse({
            ...base,
            periodStart: "2026-07-25T00:00:00.000Z",
            periodEnd: "2027-07-25T00:00:00.000Z",
        }).success,
        false
    );
});

test("tenant payment payload cannot override amount and requires a bounded receipt", () => {
    const valid = {
        branchId: "0f7683fb-7c0a-40b6-a7d1-e3548231b789",
        receipt: {
            fileName: "receipt.png",
            mimeType: "image/png",
            base64: Buffer.from([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                0x00, 0x00, 0x00, 0x00,
            ]).toString("base64"),
        },
    };

    assert.equal(submitTenantPaymentSchema.safeParse(valid).success, true);
    assert.equal(
        submitTenantPaymentSchema.safeParse({ ...valid, amount: 1 }).success,
        false
    );
    assert.equal(
        submitTenantPaymentSchema.safeParse({
            ...valid,
            receipt: { ...valid.receipt, mimeType: "image/svg+xml" },
        }).success,
        false
    );

    assert.equal(prepareReceipt(valid.receipt).sizeBytes, 12);
    assert.throws(
        () => prepareReceipt({ ...valid.receipt, mimeType: "application/pdf" }),
        (error) => error.statusCode === 422
    );
});

test("owner setup regeneration requires step-up password confirmation", () => {
    assert.equal(regenerateOwnerSetupSchema.safeParse({}).success, false);
    assert.equal(
        regenerateOwnerSetupSchema.safeParse({ currentPassword: "current-secret" }).success,
        true
    );
});

test("new tenant admins require a six-character password", () => {
    const base = {
        fullName: "Branch Admin",
        username: "branch_admin",
        branchId: "0f7683fb-7c0a-40b6-a7d1-e3548231b789",
    };
    assert.equal(createAdminSchema.safeParse({ ...base, password: "12345" }).success, false);
    assert.equal(createAdminSchema.safeParse({ ...base, password: "123456" }).success, true);
});

test("handoff codes are hashed deterministically and have bounded TTLs", () => {
    assert.equal(
        hashHandoffCode("one-time-code"),
        "3538b4902a9fad43d80819555b9849c471a422489a4f4d7eb532217195e9293d"
    );

    const now = new Date("2026-07-25T12:00:00.000Z");
    const loginExpiry = getHandoffExpiry(HandoffPurpose.LOGIN, now);
    const setupExpiry = getHandoffExpiry(HandoffPurpose.ACCOUNT_SETUP, now);
    assert.ok(loginExpiry.getTime() > now.getTime());
    assert.ok(loginExpiry.getTime() <= now.getTime() + 15 * 60 * 1000);
    assert.ok(setupExpiry.getTime() > loginExpiry.getTime());
    assert.ok(setupExpiry.getTime() <= now.getTime() + 72 * 60 * 60 * 1000);
});
