"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const AppError_1 = require("./AppError");
const requestMetrics_1 = require("../middleware/requestMetrics");
function errorHandler(err, req, res, next) {
    if (res.headersSent)
        return next(err);
    // adapter-pg 6.x passes pg-pool's acquisition timeout through as a plain
    // Error (without Prisma's P2024 code). Match the driver's fixed messages.
    if (err instanceof Error && [
        "timeout exceeded when trying to connect",
        "Connection terminated due to connection timeout",
    ].includes(err.message)) {
        res.setHeader("Retry-After", "1");
        res.status(503).json({ success: false, message: "Database temporarily unavailable. Please retry." });
        return;
    }
    if (typeof err === "object" && err !== null && "type" in err) {
        if (err.type === "entity.too.large" || err.type === "entity.parse.failed") {
            res.status(err.type === "entity.too.large" ? 413 : 400).json({
                success: false, message: err.type === "entity.too.large" ? "Request body is too large" : "Invalid JSON body",
            });
            return;
        }
    }
    // Zod validation errors — malformed request body
    if (err instanceof zod_1.ZodError) {
        const errors = err.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
        }));
        res.status(422).json({
            success: false,
            message: "Validation failed",
            errors,
        });
        return;
    }
    // Known operational errors — wrong password, not found, forbidden, etc.
    if (err instanceof AppError_1.AppError && err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
        return;
    }
    // Prisma known errors
    if (typeof err === "object" &&
        err !== null &&
        "code" in err) {
        const prismaErr = err;
        if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2037"].includes(prismaErr.code)) {
            res.setHeader("Retry-After", "1");
            res.status(503).json({ success: false, message: "Database temporarily unavailable. Please retry." });
            return;
        }
        if (prismaErr.code === "P2034") {
            res.status(409).json({ success: false, message: "Concurrent operation conflict. Retry with the same Idempotency-Key." });
            return;
        }
        if (prismaErr.code === "P2010" && "meta" in err) {
            const meta = err.meta;
            if (typeof meta === "object" && meta !== null && "code" in meta &&
                ["55P03", "57014", "40P01", "40001"].includes(String(meta.code))) {
                res.status(503).json({ success: false, message: "Database operation timed out or conflicted. Retry with the same Idempotency-Key." });
                return;
            }
        }
        if (prismaErr.code === "P2002") {
            const field = prismaErr.meta?.target?.[0] ?? "field";
            res.status(409).json({
                success: false,
                message: `${field} already exists`,
            });
            return;
        }
        if (prismaErr.code === "P2025") {
            res.status(404).json({
                success: false,
                message: "Record not found",
            });
            return;
        }
        if (prismaErr.code === "P2028") {
            res.status(503).json({
                success: false,
                message: "Database transaction timed out. Please try again.",
            });
            return;
        }
        if (prismaErr.code === "P2003") {
            res.status(400).json({
                success: false,
                message: "Invalid related record",
            });
            return;
        }
    }
    // Unknown / programming errors — never expose internals
    console.error(JSON.stringify({
        event: "unhandled_request_error", requestId: requestMetrics_1.requestContext.getStore()?.requestId,
        errorType: err instanceof Error ? err.name : typeof err,
        // Stack frames retain locations without logging the error message,
        // which Prisma may populate with SQL input/password values.
        stack: err instanceof Error ? err.stack?.split("\n").filter((line) => /^\s+at /.test(line)).join("\n") : undefined,
    }));
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
}
