import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../../../core/errors/AppError";
import { authenticateToken } from "../../../core/services/auth-identity.service";
import {
    assertStoreReadable,
    assertStoreWritable,
    refreshStoreBillingState,
} from "../../../core/services/billing-state.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isAuthSelfServicePath(path: string): boolean {
    return ["/profile", "/change-password", "/me", "/auth/profile", "/auth/change-password", "/auth/me"].some((prefix) =>
        path.startsWith(prefix)
    );
}

function isBillingRecoveryPath(req: Request): boolean {
    return req.method === "POST" && /^(?:\/api)?\/billing\/payments\/?$/.test(req.originalUrl.split("?")[0] ?? "");
}

export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Authorization");
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError(401, "Unauthorized");
        }

        const { user } = await authenticateToken(authHeader.slice(7));

        if (user.mustChangePassword && !isAuthSelfServicePath(req.path)) {
            throw new AppError(403, "Password change is required");
        }

        if (user.storeId) {
            const billingState = await refreshStoreBillingState(user.storeId);
            assertStoreReadable(billingState);

            if (
                !READ_METHODS.has(req.method) &&
                !isAuthSelfServicePath(req.path) &&
                !isBillingRecoveryPath(req)
            ) {
                assertStoreWritable(billingState);
            }
        }

        req.user = {
            id: user.id,
            role: user.role,
            storeId: user.storeId,
            branchId: user.branchId,
            authVersion: user.authVersion,
        };
        next();
    } catch (error) {
        if (error instanceof AppError) return next(error);
        if (error instanceof jwt.JsonWebTokenError) {
            return next(new AppError(401, "Invalid or expired token"));
        }
        next(error);
    }
}
