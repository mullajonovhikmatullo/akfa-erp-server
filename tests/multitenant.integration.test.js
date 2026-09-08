const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const http = require("node:http");

const databaseUrl = process.env.TEST_DATABASE_URL;

test("HTTP and Socket.IO tenant boundaries on PostgreSQL", { skip: !databaseUrl, timeout: 120000 }, async (t) => {
    assert.match(new URL(databaseUrl).pathname, /_test$/);
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    process.env.REGISTRATION_RATE_LIMIT_MAX = "100";
    process.env.LOGIN_RATE_LIMIT_MAX = "100";
    process.env.HANDOFF_RATE_LIMIT_MAX = "100";
    process.env.STORAGE_PROVIDER = "local";
    process.env.PUBLIC_UPLOAD_BASE_URL = "/api/uploads";
    const uploadRoot = await mkdtemp(join(tmpdir(), "shop-isolation-"));
    process.env.UPLOAD_ROOT = uploadRoot;

    const express = require("express");
    const jwt = require("jsonwebtoken");
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    const sockets = require("../dist/infrastructure/socket");
    const { errorHandler } = require("../dist/core/errors/errorHandler");
    const app = express();
    app.use(express.json({ limit: "6mb" }));
    const router = express.Router();
    for (const name of ["auth", "users", "admins", "branches", "products", "customers", "sales", "expenses", "inventory", "transfers", "analytics", "billing", "media", "platform"]) {
        router.use(`/${name}`, require(`../dist/modules/${name}/${name}.routes`).default);
    }
    router.use("/public", require("../dist/modules/onboarding/onboarding.routes").default);
    router.use("/uploads", require("../dist/modules/products/images/product-image-files.routes").default);
    app.use("/api", router);
    app.use("/", router);
    app.use(errorHandler);
    const server = http.createServer(app);
    const io = sockets.initSocketServer(server, () => true);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const planId = randomUUID();
    const planCode = `T${randomBytes(6).toString("hex").toUpperCase()}`;
    const storeIds = [];
    const clients = [];
    let platformId;

    async function request(token, path, method = "GET", body, expected = 200, headers = {}) {
        const response = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...headers },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
        assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
        return { data: data?.data ?? data, headers: response.headers };
    }

    async function register(label) {
        const username = `tenant_${randomBytes(8).toString("hex")}`;
        const password = randomBytes(16).toString("hex");
        const { data } = await request(null, "/api/public/stores/register", "POST", {
            storeName: label, ownerName: label, phone: "+998901234567", username, password, confirmPassword: password, planCode,
        }, 201);
        storeIds.push(data.store.id);
        const { data: session } = await request(null, "/api/auth/handoff/exchange", "POST", { handoffCode: data.handoffCode });
        assert.equal(session.user.id, data.user.id);
        assert.equal(session.user.storeId, data.store.id);
        assert.equal(session.user.rawRole, "STORE_OWNER");
        await request(null, "/api/auth/handoff/exchange", "POST", { handoffCode: data.handoffCode }, 400);
        return { ...data, token: session.accessToken, username, password };
    }

    async function connect(token, extra = {}) {
        const ws = new WebSocket(`${base.replace("http:", "ws:")}/api/socket.io/?EIO=4&transport=websocket`);
        const client = { ws, packets: [], id: undefined };
        clients.push(client);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Socket handshake timed out")), 5000);
            ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Socket transport failed")); });
            ws.addEventListener("message", ({ data }) => {
                const packet = String(data);
                client.packets.push(packet);
                if (packet.startsWith("0")) ws.send(`40${JSON.stringify({ token, ...extra })}`);
                if (packet === "2") ws.send("3");
                if (packet.startsWith("40")) { client.id = JSON.parse(packet.slice(2)).sid; clearTimeout(timer); resolve(); }
                if (packet.startsWith("44")) { clearTimeout(timer); reject(new Error("Unauthorized")); }
            });
        });
        // The production server rechecks the account asynchronously after the handshake.
        for (let i = 0; i < 100 && io.of("/").sockets.get(client.id)?.rooms.size < 4; i++) await delay(10);
        return client;
    }

    const reportQuery = "?from=2020-01-01&to=2099-01-01";
    const snapshot = async (owner) => {
        const [profile, dashboard, sales, expenses] = await Promise.all([
            request(owner.token, "/api/auth/me"), request(owner.token, `/api/analytics/dashboard${reportQuery}`),
            request(owner.token, "/api/sales"), request(owner.token, "/api/expenses"),
        ]);
        assert.equal(profile.data.id, owner.user.id);
        assert.equal(profile.data.storeId, owner.store.id);
        assert.equal(profile.data.store.id, owner.store.id);
        for (const row of [...sales.data, ...expenses.data]) assert.equal(row.storeId, owner.store.id);
        return { profile: profile.data, dashboard: dashboard.data, sales: sales.data, expenses: expenses.data };
    };

    try {
        await prisma.plan.create({ data: { id: planId, code: planCode, name: "Isolation test", isPublic: true, maxUsers: 3, maxBranches: 3, monthlyPriceUzs: 100 } });
        const a = await register("Owner A");
        const loginA = await request(null, "/api/auth/login", "POST", { username: a.username, password: a.password });
        a.token = loginA.data.accessToken;
        const category = (await request(a.token, "/api/expenses/categories", "POST", { name: "Rent" }, 201)).data;
        const expenseInput = { categoryId: category.id, amount: 25 };
        const expense = (await request(a.token, "/api/expenses", "POST", expenseInput, 201)).data;
        const product = (await request(a.token, "/api/products", "POST", {
            name: "Private product A", sku: "PER_STORE_SKU", unit: "PIECE", costPriceUzs: 50, retailPriceUzs: 100, wholesalePriceUzs: 80,
        }, 201)).data;
        const stock = (await request(a.token, "/api/inventory/stock-in", "POST", { productId: product.id, quantity: 100, costPriceUzs: 50 }, 201)).data;
        const customer = (await request(a.token, "/api/customers", "POST", { fullName: "Customer A", phone: "+998901234567" }, 201)).data;
        const saleInput = { items: [{ productId: product.id, quantity: 1 }], saleType: "RETAIL", paidAmountUzs: 0, paymentMethod: "CREDIT", customerId: customer.id };
        const sale = (await request(a.token, "/api/sales", "POST", saleInput, 201)).data;
        let b;

        await t.test("new registration overlaps A's reads and writes without identity or data crossover", async () => {
            [b] = await Promise.all([
                register("Owner B"), snapshot(a), request(a.token, "/api/expenses", "POST", expenseInput, 201),
                request(a.token, "/api/sales", "POST", saleInput, 201),
            ]);
            assert.notEqual(a.store.id, b.store.id);
            for (let i = 0; i < 8; i++) {
                const [sa, sb] = await Promise.all([snapshot(a), snapshot(b)]);
                assert.equal(sa.dashboard.sales.saleCount, 2);
                assert.equal(sa.dashboard.expenses.total, 50);
                assert.equal(sb.dashboard.sales.saleCount, 0);
                assert.equal(sb.dashboard.expenses.total, 0);
                assert.deepEqual(sb.sales, []);
                assert.deepEqual(sb.expenses, []);
            }
        });
        assert.ok(b, "Owner B was provisioned");

        await t.test("all operational lists, reports, and forged tenant filters stay in B", async () => {
            for (const path of ["/products", "/products/categories", "/expenses/categories", "/customers", "/inventory", "/inventory/movements", "/inventory/batches", "/transfers", "/admins", "/billing/payments"]) {
                const result = await request(b.token, `/api${path}?storeId=${a.store.id}`);
                assert.deepEqual(result.data, [], path);
            }
            for (const path of ["/sales", "/expenses"]) assert.deepEqual((await request(b.token, `/api${path}?branchId=${a.branch.id}&storeId=${a.store.id}`)).data, []);
            assert.equal((await request(b.token, "/api/billing")).data.id, b.store.id);
            assert.equal((await request(b.token, "/api/branches")).data[0].storeId, b.store.id);
            assert.equal((await request(b.token, "/api/sales/payments")).data.total, 0);
            assert.equal((await request(b.token, `/api/inventory/receipts/${stock.receiptId}/items`)).data.total, 0);
            for (const path of ["sales", "expenses", "inventory", "customers/debt"]) {
                const result = await request(b.token, `/api/analytics/${path}${reportQuery}`);
                for (const id of [sale.id, expense.id, product.id, customer.id, a.branch.id]) assert.ok(!JSON.stringify(result.data).includes(id));
            }
        });

        await t.test("IDOR reads, updates, deletes and foreign related IDs are denied", async () => {
            for (const path of [`/expenses/${expense.id}`, `/sales/${sale.id}`, `/customers/${customer.id}`, `/products/${product.id}`, `/products/${product.id}/images`, `/expenses/categories/${category.id}`]) {
                await request(b.token, `/api${path}`, "GET", undefined, 404);
            }
            // There is intentionally no expense-update route; test the existing category and sale update routes too.
            await request(b.token, `/api/expenses/${expense.id}`, "PATCH", { amount: 1 }, 404);
            await request(b.token, `/api/expenses/${expense.id}`, "DELETE", undefined, 404);
            await request(b.token, `/api/expenses/categories/${category.id}`, "PATCH", { name: "stolen" }, 404);
            await request(b.token, `/api/products/${product.id}`, "PATCH", { name: "stolen" }, 404);
            await request(b.token, `/api/products/${product.id}`, "DELETE", undefined, 404);
            await request(b.token, `/api/customers/${customer.id}`, "PATCH", { fullName: "stolen" }, 404);
            await request(b.token, `/api/customers/${customer.id}`, "DELETE", undefined, 404);
            await request(b.token, `/api/branches/${a.branch.id}`, "PATCH", { name: "stolen" }, 404);
            await request(b.token, `/api/branches/${a.branch.id}`, "DELETE", undefined, 404);
            await request(b.token, `/api/sales/${sale.id}/payments`, "POST", { amountUzs: 1, paymentMethod: "CASH_UZS" }, 404);
            await request(b.token, `/api/sales/${sale.id}/debt-deadline`, "PATCH", { debtDueDate: null }, 404);
            await request(b.token, "/api/expenses", "POST", { ...expenseInput, storeId: a.store.id, branchId: a.branch.id }, 404);
            await request(b.token, "/api/sales", "POST", saleInput, 404);
            await request(b.token, "/api/inventory/stock-in", "POST", { productId: product.id, quantity: 1, costPriceUzs: 50 }, 404);
            assert.equal(Number((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).amount), 25);
        });

        await t.test("owner admins inherit the tenant; roles, cross-owner management and concurrent plan capacity hold", async () => {
            const create = (owner) => request(owner.token, "/api/admins", "POST", {
                fullName: "Admin", username: `admin_${randomBytes(8).toString("hex")}`, password: "test-admin-password", branchId: owner.branch.id,
            }, 201);
            const admin = (await create(a)).data;
            assert.equal(admin.storeId, a.store.id);
            await request(b.token, `/api/admins/${admin.id}`, "GET", undefined, 404);
            await request(b.token, `/api/admins/${admin.id}`, "PATCH", { fullName: "stolen" }, 404);
            await request(b.token, `/api/admins/${admin.id}`, "DELETE", undefined, 404);
            const adminToken = (await request(null, "/api/auth/login", "POST", { username: admin.username, password: "test-admin-password" })).data.accessToken;
            await request(adminToken, "/api/admins", "POST", {}, 403);
            await request(a.token, "/api/admins", "POST", { fullName: "Forged", username: "forged", password: "testpass", branchId: b.branch.id, storeId: b.store.id }, 422);
            const attempts = await Promise.all(Array.from({ length: 5 }, async () => {
                const response = await fetch(`${base}/api/admins`, { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ fullName: "Racing admin", username: `race_${randomBytes(8).toString("hex")}`, password: "test-admin-password", branchId: a.branch.id }) });
                await response.arrayBuffer();
                return response.status;
            }));
            assert.equal(attempts.filter((status) => status === 201).length, 1);
            assert.ok(attempts.every((status) => status === 201 || status === 409));
            assert.equal(await prisma.user.count({ where: { storeId: a.store.id, isActive: true } }), 3);
            assert.equal((await create(b)).data.storeId, b.store.id);
        });

        await t.test("authenticated sockets ignore forged rooms; A logout has zero effect on B", async () => {
            const sa = await connect(a.token);
            const sb = await connect(b.token, { storeId: a.store.id, branchId: a.branch.id, userId: a.user.id });
            const payload = { storeId: a.store.id, transferId: randomUUID(), status: "PENDING", fromBranchId: a.branch.id, toBranchId: a.branch.id };
            sb.ws.send(`42${JSON.stringify(["join", `store-managers:${a.store.id}`])}`);
            sockets.emitTransferChanged(payload);
            await delay(100);
            assert.ok(sa.packets.some((packet) => packet.includes(payload.transferId)));
            assert.ok(!sb.packets.some((packet) => packet.includes(payload.transferId)));
            const before = await snapshot(b);
            // The actual frontend logout only discards this client's token and disconnects its socket.
            // The backend has no logout route. Do not invent one for the reproduction.
            sa.ws.close();
            const oldA = a.token;
            a.token = null;
            await request(a.token, "/api/auth/me", "GET", undefined, 401);
            for (let i = 0; i < 5; i++) assert.deepEqual(await snapshot(b), before);
            assert.ok(io.of("/").sockets.has(sb.id));
            // Also verify the existing server-side revocation path affects only A.
            const changed = await request(oldA, "/api/auth/change-password", "POST", { currentPassword: a.password, newPassword: "changed-test-password", confirmPassword: "changed-test-password" });
            a.token = changed.data.accessToken;
            await request(oldA, "/api/auth/me", "GET", undefined, 401);
            assert.deepEqual(await snapshot(b), before);
            await assert.rejects(() => connect(oldA), /Unauthorized/);
        });

        await t.test("JWT role and store claims never override the database identity; platform routes remain explicit", async () => {
            const forgedClaims = jwt.sign({ id: b.user.id, authVersion: 0, role: "PLATFORM_OWNER", storeId: a.store.id, branchId: a.branch.id }, process.env.JWT_SECRET);
            assert.equal((await request(forgedClaims, "/api/auth/me")).data.id, b.user.id);
            await request(forgedClaims, "/api/platform/stores", "GET", undefined, 403);
            const platform = await prisma.user.create({ data: { fullName: "Test platform", username: `platform_${randomBytes(8).toString("hex")}`, password: "unusable", role: "PLATFORM_OWNER" } });
            platformId = platform.id;
            const token = jwt.sign({ id: platform.id, authVersion: 0 }, process.env.JWT_SECRET);
            assert.equal((await request(token, `/api/platform/stores/${a.store.id}`)).data.id, a.store.id);
            await request(token, "/api/expenses", "GET", undefined, 403);
        });

        await t.test("product image bytes require authentication and same-store ownership", async () => {
            const sharp = require("sharp");
            const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
            const form = new FormData();
            form.append("images", new Blob([bytes], { type: "image/png" }), "private.png");
            const upload = await fetch(`${base}/api/products/${product.id}/images`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` }, body: form });
            assert.equal(upload.status, 201);
            const image = (await upload.json()).data[0];
            const url = new URL(image.url, base).pathname;
            const own = await fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${a.token}` } });
            assert.equal(own.status, 200);
            await own.arrayBuffer();
            await request(b.token, url, "GET", undefined, 404);
            await request(null, url, "GET", undefined, 401);
            assert.match(own.headers.get("cache-control"), /no-store/);
        });

        await t.test("authenticated profiles cannot be reused by shared caches", async () => {
            const response = await request(a.token, "/api/auth/me");
            assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        });

        await t.test("invalid JWT claims are rejected before any unconstrained user lookup", async () => {
            for (const claims of [{ authVersion: 0 }, { id: a.user.id }, { id: a.user.id, authVersion: -1 }]) {
                await request(jwt.sign(claims, process.env.JWT_SECRET), "/api/auth/me", "GET", undefined, 401);
            }
        });

        await t.test("transfer transitions, payment receipts and nested records remain tenant owned", async () => {
            const destination = (await request(a.token, "/api/branches", "POST", { name: "Second branch" }, 201)).data;
            const transfer = (await request(a.token, "/api/transfers", "POST", {
                toBranchId: destination.id, items: [{ productId: product.id, quantity: 1 }],
            }, 201)).data;
            await request(b.token, `/api/transfers/${transfer.id}`, "GET", undefined, 404);
            await request(b.token, `/api/transfers/${transfer.id}/complete`, "POST", {}, 404);
            await request(b.token, `/api/transfers/${transfer.id}/cancel`, "POST", {}, 404);
            await request(a.token, "/api/transfers", "POST", {
                toBranchId: b.branch.id, items: [{ productId: product.id, quantity: 1 }],
            }, 404);
            assert.equal((await prisma.transfer.findUniqueOrThrow({ where: { id: transfer.id } })).status, "PENDING");
            const payment = (await request(a.token, "/api/billing/payments", "POST", {
                receipt: { fileName: "test.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-test-receipt").toString("base64") },
            }, 201)).data;
            await request(b.token, `/api/media/${payment.receiptMedia.id}`, "GET", undefined, 404);
            await request(null, `/api/media/${payment.receiptMedia.id}`, "GET", undefined, 401);
            await request(a.token, `/api/media/${payment.receiptMedia.id}`);
        });

        await t.test("database rejects a store user without a tenant or with a foreign branch", async () => {
            const userData = { fullName: "Invalid membership", username: `invalid_${randomBytes(8).toString("hex")}`, password: "unusable", role: "BRANCH_ADMIN" };
            await assert.rejects(() => prisma.user.create({ data: userData }));
            await assert.rejects(() => prisma.user.update({ where: { id: b.user.id }, data: { branchId: a.branch.id } }));
            assert.equal((await request(b.token, "/api/auth/me")).data.branchId, b.branch.id);
        });

        await t.test("socket access expires with its JWT without disconnecting another tenant", async () => {
            const token = jwt.sign({ id: a.user.id, authVersion: 1 }, process.env.JWT_SECRET, { expiresIn: 2 });
            const expiring = await connect(token);
            const other = await connect(b.token);
            for (let i = 0; i < 60 && io.of("/").sockets.has(expiring.id); i++) await delay(50);
            assert.ok(!io.of("/").sockets.has(expiring.id));
            assert.ok(io.of("/").sockets.has(other.id));
        });

        await t.test("simultaneous registrations with the same store name allocate independent tenants", async () => {
            const [first, second] = await Promise.all([register("Concurrent store"), register("Concurrent store")]);
            assert.notEqual(first.store.id, second.store.id);
            assert.notEqual(first.store.slug, second.store.slug);
            await Promise.all([snapshot(first), snapshot(second)]);
        });

        await t.test("create ownership is server assigned and SKU/category/phone uniqueness is per store", async () => {
            const ownCategory = (await request(b.token, "/api/expenses/categories", "POST", { name: category.name, storeId: a.store.id }, 201)).data;
            const ownExpense = (await request(b.token, "/api/expenses", "POST", { categoryId: ownCategory.id, amount: 1, storeId: a.store.id, createdById: a.user.id }, 201)).data;
            assert.equal(ownExpense.storeId, b.store.id);
            assert.equal(ownExpense.createdBy.id, b.user.id);
            const ownProduct = (await request(b.token, "/api/products", "POST", {
                name: "Product B", sku: product.sku, unit: "PIECE", costPriceUzs: 50, retailPriceUzs: 100, wholesalePriceUzs: 80, storeId: a.store.id,
            }, 201)).data;
            assert.equal(ownProduct.storeId, b.store.id);
            const ownCustomer = (await request(b.token, "/api/customers", "POST", { fullName: "Customer B", phone: customer.phone, storeId: a.store.id }, 201)).data;
            assert.equal(ownCustomer.storeId, b.store.id);
        });
    } finally {
        for (const client of clients) client.ws.close();
        await sockets.closeSocketServer();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (storeIds.length) {
            const scope = { storeId: { in: storeIds } };
            await prisma.$transaction(async (tx) => {
                await tx.salePayment.deleteMany({ where: { sale: scope } });
                await tx.saleItem.deleteMany({ where: { sale: scope } });
                await tx.sale.deleteMany({ where: scope });
                await tx.expense.deleteMany({ where: scope });
                await tx.expenseCategory.deleteMany({ where: scope });
                await tx.transferItem.deleteMany({ where: { transfer: scope } });
                await tx.transfer.deleteMany({ where: scope });
                await tx.payment.deleteMany({ where: scope });
                await tx.mediaObject.deleteMany({ where: scope });
                await tx.stockMovement.deleteMany({ where: scope });
                await tx.stockBatch.deleteMany({ where: scope });
                await tx.inventory.deleteMany({ where: scope });
                await tx.customer.deleteMany({ where: scope });
                await tx.productImage.deleteMany({ where: scope });
                await tx.product.deleteMany({ where: scope });
                await tx.auditLog.deleteMany({ where: scope });
                await tx.user.deleteMany({ where: scope });
                await tx.branch.deleteMany({ where: scope });
                await tx.subscription.deleteMany({ where: scope });
                await tx.store.deleteMany({ where: { id: { in: storeIds } } });
            });
        }
        if (platformId) await prisma.user.deleteMany({ where: { id: platformId } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.$disconnect();
        await rm(uploadRoot, { recursive: true, force: true });
    }
});
