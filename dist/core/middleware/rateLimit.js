"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sensitiveActionRateLimit = exports.handoffRateLimit = exports.registrationRateLimit = exports.loginRateLimit = void 0;
exports.createRateLimit = createRateLimit;
function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function createRateLimit(options) {
    const buckets = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
        const existing = buckets.get(key);
        const bucket = !existing || existing.resetsAt <= now
            ? { count: 0, resetsAt: now + options.windowMs }
            : existing;
        bucket.count += 1;
        buckets.set(key, bucket);
        if (buckets.size > 5000) {
            for (const [bucketKey, value] of buckets) {
                if (value.resetsAt <= now)
                    buckets.delete(bucketKey);
            }
        }
        res.setHeader("RateLimit-Limit", String(options.max));
        res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - bucket.count)));
        res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetsAt / 1000)));
        if (bucket.count > options.max) {
            res.setHeader("Retry-After", String(Math.ceil((bucket.resetsAt - now) / 1000)));
            return res.status(429).json({
                success: false,
                message: "Too many requests. Please try again later.",
            });
        }
        return next();
    };
}
exports.loginRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
});
exports.registrationRateLimit = createRateLimit({
    windowMs: 60 * 60 * 1000,
    max: positiveInteger(process.env.REGISTRATION_RATE_LIMIT_MAX, 5),
});
exports.handoffRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: positiveInteger(process.env.HANDOFF_RATE_LIMIT_MAX, 20),
});
exports.sensitiveActionRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: positiveInteger(process.env.SENSITIVE_ACTION_RATE_LIMIT_MAX, 10),
    key: (req) => req.user?.id ?? req.ip ?? req.socket.remoteAddress ?? "unknown",
});
