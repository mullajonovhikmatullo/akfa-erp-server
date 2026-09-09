const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/google_auth_test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
const { GoogleIdentityService } = require("../dist/modules/auth/services/google-identity.service");
const { AuthService } = require("../dist/modules/auth/services/auth.service");
const { googleLoginSchema } = require("../dist/modules/auth/validations/auth.validation");
const prismaModule = require("../dist/infrastructure/prisma/prisma");
const originalPrisma = prismaModule.prisma;
const billing = require("../dist/core/services/billing-state.service");
const limits = require("../dist/core/services/store-lock.service");
const sockets = require("../dist/infrastructure/socket");
const clientId = "123456789-test.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const password = "test-password";
const account = {
    id: "store-user", username: "owner", fullName: "Store owner", password: bcrypt.hashSync(password, 4),
    role: "STORE_OWNER", storeId: "store-1", branchId: "branch-1", authVersion: 0,
    isActive: true, mustChangePassword: false, googleSubject: null,
};
const activeStore = {
    id: "store-1", status: "ACTIVE", billingVersion: 1,
    subscription: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400000) },
};

function credential(claims = {}, options = {}) {
    //
    return jwt.sign({ sub: "google-subject", email: "owner@gmail.com", email_verified: true, ...claims }, privateKey, {
        keyid: "test-key", algorithm: "RS256", audience: clientId,
        issuer: "https://accounts.google.com", expiresIn: "1h", ...options,
    });
}

beforeEach((t) => {
    //
    t.after(() => { prismaModule.prisma = originalPrisma; });
    process.env.GOOGLE_CLIENT_ID = clientId;
    t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({
        certs: { "test-key": publicKey }, format: "PEM",
    }));
});

function database(t, { linked = null, user = account, changed = 1, store = activeStore } = {}) {
    //
    const queries = [];
    const updates = [];
    const audit = [];
    const tx = {
        store: { findUnique: async () => store },
        user: {
            updateMany: async (input) => { updates.push(input); return { count: changed }; },
            findUniqueOrThrow: async () => ({ ...user, authVersion: user.authVersion + (user.googleSubject ? 0 : 1) }),
        },
        auditLog: { create: async (input) => { audit.push(input); return input; } },
    };
    prismaModule.prisma = {
        user: {
            findUnique: async (input) => {
                //
                queries.push(input);
                return "googleSubject" in input.where ? linked : user;
            },
        },
        $transaction: async (callback) => callback(tx),
    };
    t.mock.method(billing, "refreshStoreBillingState", async () => store);
    t.mock.method(limits, "lockStore", async () => undefined);
    t.mock.method(sockets, "disconnectUserSockets", () => undefined);
    return { queries, updates, audit };
}

test("Google sign-in is unavailable until a Web client ID is configured", async () => {
    //
    delete process.env.GOOGLE_CLIENT_ID;
    assert.deepEqual(GoogleIdentityService.getConfig(), { clientId: null });
    await assert.rejects(GoogleIdentityService.verifyCredential(credential()), { statusCode: 503 });
});

test("Google credentials verify their signature and stable subject", async () => {
    //
    assert.deepEqual(await GoogleIdentityService.verifyCredential(credential()), {
        subject: "google-subject", email: "owner@gmail.com",
    });
});

test("Google rejects wrong audience, issuer, expiry, signature and unverified email", async () => {
    //
    const valid = credential();
    const [header, body, signature] = valid.split(".");
    const tampered = `${header}.${body}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    for (const invalid of [
        credential({}, { audience: "another-app" }),
        credential({}, { issuer: "https://attacker.example" }),
        credential({}, { expiresIn: -3600 }),
        credential({ email_verified: false }),
        credential({ sub: "" }),
        tampered,
    ]) {
        await assert.rejects(GoogleIdentityService.verifyCredential(invalid), { statusCode: 401 });
    }
});

test("Google request validation rejects extra fields and incomplete password proof", () => {
    //
    assert.equal(googleLoginSchema.safeParse({ credential: credential() }).success, true);
    assert.equal(googleLoginSchema.safeParse({ credential: credential(), storeId: "other-store" }).success, false);
    assert.equal(googleLoginSchema.safeParse({ credential: credential(), account: { username: "owner" } }).success, false);
    assert.equal(googleLoginSchema.safeParse({ credential: "short" }).success, false);
});

test("An unlinked Google subject requests password proof without granting access", async (t) => {
    //
    const db = database(t);
    const result = await AuthService.loginWithGoogle({ credential: credential() });
    assert.deepEqual(result, { status: "link_required", email: "owner@gmail.com" });
    assert.deepEqual(db.queries.map((query) => query.where), [{ googleSubject: "google-subject" }]);
    assert.equal(db.updates.length, 0);
});

test("A linked Google account receives its existing store role and session", async (t) => {
    //
    database(t, { linked: { ...account, googleSubject: "google-subject" } });
    const result = await AuthService.loginWithGoogle({ credential: credential({ email: "new-address@gmail.com" }) });
    assert.equal(result.status, "authenticated");
    assert.equal(result.session.user.id, account.id);
    assert.equal(result.session.user.role, "store_owner");
    const token = jwt.verify(result.session.accessToken, process.env.JWT_SECRET);
    assert.equal(token.storeId, account.storeId);
    assert.equal(token.branchId, account.branchId);
    assert.equal(token.authVersion, account.authVersion);
});

test("Linking requires the existing password and records a guarded atomic association", async (t) => {
    //
    const db = database(t);
    const result = await AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password } });
    assert.equal(result.status, "authenticated");
    assert.equal(db.updates.length, 1);
    assert.equal(db.updates[0].where.googleSubject, null);
    assert.equal(db.updates[0].where.password, account.password);
    assert.equal(db.updates[0].where.authVersion, account.authVersion);
    assert.equal(db.updates[0].data.googleSubject, "google-subject");
    assert.equal(db.audit[0].data.action, "GOOGLE_ACCOUNT_LINKED");
    assert.equal(jwt.verify(result.session.accessToken, process.env.JWT_SECRET).authVersion, 1);
});

test("Wrong password cannot attach a Google identity", async (t) => {
    //
    const db = database(t);
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password: "wrong" } }), { statusCode: 401 });
    assert.equal(db.updates.length, 0);
});

test("An existing Google association cannot be overwritten", async (t) => {
    //
    const db = database(t, { user: { ...account, googleSubject: "different-subject" } });
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password } }), { statusCode: 409 });
    assert.equal(db.updates.length, 0);
});

test("A Google account from another store cannot be attached to the entered account", async (t) => {
    //
    const db = database(t, { linked: { ...account, id: "other-user", storeId: "other-store" } });
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password } }), { statusCode: 409 });
    assert.equal(db.updates.length, 0);
});

test("Disabled, setup-required and platform accounts cannot enter the store via Google", async (t) => {
    //
    for (const restrictions of [{ isActive: false }, { mustChangePassword: true }, { role: "PLATFORM_OWNER" }, { storeId: null }]) {
        database(t, { linked: { ...account, ...restrictions } });
        await assert.rejects(AuthService.loginWithGoogle({ credential: credential() }), { statusCode: 403 });
    }
});

test("Suspended stores cannot sign in or establish Google links", async (t) => {
    //
    const db = database(t, { linked: account, store: { ...activeStore, status: "SUSPENDED" } });
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential() }), { statusCode: 403 });
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password } }), { statusCode: 403 });
    assert.equal(db.updates.length, 0);
});

test("A concurrent account change prevents linking and token issuance", async (t) => {
    //
    const db = database(t, { changed: 0 });
    await assert.rejects(AuthService.loginWithGoogle({ credential: credential(), account: { username: "owner", password } }), { statusCode: 409 });
    assert.equal(db.audit.length, 0);
});
