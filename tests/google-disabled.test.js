const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/google_disabled_test";
process.env.JWT_SECRET ||= randomBytes(32).toString("hex");

test("Google sign-in endpoints are off unless GOOGLE_SIGN_IN_ENABLED=1", async () => {
    const express = require("express");
    const { errorHandler } = require("../dist/core/errors/errorHandler");
    const app = express();
    app.use(express.json());
    app.use("/api/auth", require("../dist/modules/auth/auth.routes").default);
    app.use(errorHandler);
    const server = http.createServer(app).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const previous = process.env.GOOGLE_SIGN_IN_ENABLED;

    try {
        delete process.env.GOOGLE_SIGN_IN_ENABLED;
        const config = await fetch(`${base}/google/config`);
        assert.equal(config.status, 503);
        assert.equal((await config.json()).message, "Google sign-in is in development");
        const login = await fetch(`${base}/google`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: "x" }),
        });
        assert.equal(login.status, 503);

        process.env.GOOGLE_SIGN_IN_ENABLED = "1";
        process.env.GOOGLE_CLIENT_ID = "";
        assert.equal((await fetch(`${base}/google/config`)).status, 200);
    } finally {
        if (previous === undefined) delete process.env.GOOGLE_SIGN_IN_ENABLED;
        else process.env.GOOGLE_SIGN_IN_ENABLED = previous;
        server.close();
    }
});
