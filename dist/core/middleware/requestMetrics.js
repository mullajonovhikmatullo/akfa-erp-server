"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
exports.requestRoute = requestRoute;
exports.requestMetrics = requestMetrics;
const async_hooks_1 = require("async_hooks");
const crypto_1 = require("crypto");
const runtime_1 = require("../config/runtime");
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
const slowRequestMs = (0, runtime_1.positiveIntegerEnv)("SLOW_REQUEST_MS", 1000);
function requestRoute(req) {
    return req.route?.path ? `${req.baseUrl}${req.route.path}` : "(unmatched)";
}
function requestMetrics(req, res, next) {
    const requestId = (0, crypto_1.randomUUID)();
    const startedAt = performance.now();
    res.setHeader("X-Request-Id", requestId);
    res.once("close", () => {
        const durationMs = Math.round(performance.now() - startedAt);
        if (durationMs >= slowRequestMs || res.statusCode >= 500 || !res.writableFinished) {
            console.warn(JSON.stringify({
                event: "http_request", requestId, method: req.method, route: requestRoute(req),
                status: res.statusCode, durationMs, aborted: !res.writableFinished,
            }));
        }
    });
    exports.requestContext.run({ requestId }, next);
}
