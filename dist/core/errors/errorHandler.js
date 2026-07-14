"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const AppError_1 = require("./AppError");
function errorHandler(err, req, res, next) {
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
    console.error("[Unhandled Error]", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
}
