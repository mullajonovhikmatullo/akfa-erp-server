import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./AppError";

export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Zod validation errors — malformed request body
    if (err instanceof ZodError) {
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
    if (err instanceof AppError && err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
        return;
    }

    // Prisma known errors
    if (
        typeof err === "object" &&
        err !== null &&
        "code" in err
    ) {
        const prismaErr = err as { code: string; meta?: { target?: string[] } };
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
    }

    // Unknown / programming errors — never expose internals
    console.error("[Unhandled Error]", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
}
