const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const http = require("node:http");
const { randomUUID, randomBytes } = require("node:crypto");

test("HTTP server drains requests, closes Socket.IO and disconnects its pool", { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 }, async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = require("../dist/infrastructure/prisma/prisma");
    assert.match(new URL(databaseUrl).pathname, /_test$/);
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const username = `runtime_${randomUUID()}`;
    const secret = randomBytes(32).toString("hex");
    const child = spawn(process.execPath, ["dist/server.js"], {
        env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", PORT: String(port),
            JWT_SECRET: secret, PLATFORM_OWNER_USERNAME: username,
            PLATFORM_OWNER_PASSWORD: randomBytes(24).toString("hex"),
            SHUTDOWN_TIMEOUT_MS: "5000", DB_CONNECTION_TIMEOUT_MS: "500" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let logs = "";
    let socket;
    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
            child.stdout.on("data", (chunk) => {
                logs = (logs + chunk.toString()).slice(-10000);
                if (logs.includes("SERVER RUNNING ON")) { clearTimeout(timeout); resolve(); }
            });
            child.stderr.on("data", (chunk) => { logs = (logs + chunk.toString()).slice(-10000); });
            child.once("exit", () => { clearTimeout(timeout); reject(new Error(`Server exited during startup: ${logs}`)); });
        });
        const base = `http://127.0.0.1:${port}`;
        const requests = Array.from({ length: 20 }, async () => {
            const response = await fetch(`${base}/api/health`);
            assert.equal(response.status, 200);
            assert.match(response.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
            assert.equal((await response.json()).status, "ok");
        });
        await Promise.all(requests);
        const unauthorized = await fetch(`${base}/api/products?secret=should-not-appear-in-logs`, { headers: { Authorization: "Bearer invalid-token-must-not-appear" } });
        assert.equal(unauthorized.status, 401);
        await unauthorized.arrayBuffer();
        const invalidJson = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
        assert.equal(invalidJson.status, 400);
        await invalidJson.arrayBuffer();
        const oversized = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(1024 * 1024) }) });
        assert.equal(oversized.status, 413);
        await oversized.arrayBuffer();

        // The profile-photo contract permits >1 MB, but only this authenticated,
        // admission-limited route uses the larger parser.
        const owner = await prisma.user.upsert({ where: { username },
            create: { username, fullName: "Runtime test", password: "No password login in this test", role: "PLATFORM_OWNER" },
            update: {}, select: { id: true, authVersion: true } });
        const token = require("jsonwebtoken").sign({ id: owner.id, authVersion: owner.authVersion }, secret);
        const largePhoto = Buffer.alloc(1024 * 1024, 0);
        largePhoto[0] = 0xff; largePhoto[1] = 0xd8; largePhoto[2] = 0xff;
        const photoBody = JSON.stringify({ base64Photo: `data:image/jpeg;base64,${largePhoto.toString("base64")}` });
        const photo = await fetch(`${base}/api/auth/profile/photo`, { method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: photoBody });
        assert.equal(photo.status, 200);
        await photo.arrayBuffer();
        const removedPhoto = await fetch(`${base}/api/auth/profile/photo`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        assert.equal(removedPhoto.status, 200);
        await removedPhoto.arrayBuffer();

        // Keep an Engine.IO transport alive during shutdown. No account/token
        // is invented for the application namespace.
        socket = new WebSocket(`ws://127.0.0.1:${port}/api/socket.io/?EIO=4&transport=websocket`);
        await new Promise((resolve, reject) => {
            socket.addEventListener("message", (event) => { if (String(event.data).startsWith("0")) resolve(); }, { once: true });
            socket.addEventListener("error", reject, { once: true });
        });
        const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
        child.kill("SIGTERM");
        const [code, signal] = await exited;
        await closed;
        assert.equal(code, 0, logs);
        assert.equal(signal, null);
        assert.ok(logs.includes('"reason":"SIGTERM"'));
        assert.ok(!logs.includes("should-not-appear-in-logs"));
        assert.ok(!logs.includes("invalid-token-must-not-appear"));
    } finally {
        socket?.close();
        if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await exited; }
        await prisma.user.deleteMany({ where: { username } });
        await prisma.$disconnect();
    }
});
