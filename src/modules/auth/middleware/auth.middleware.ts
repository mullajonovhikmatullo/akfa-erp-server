import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import {
    assertStoreReadable,
    assertStoreWritable,
    refreshStoreBillingState,
} from "../../../core/services/billing-state.service";
import { isPlatformRole } from "../../../core/utils/role-access";
import { prisma } from "../../../infrastructure/prisma/prisma";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isAuthSelfServicePath(path: string): boolean {
    return ["/profile", "/change-password", "/me", "/auth/profile", "/auth/change-password", "/auth/me"].some((prefix) =>
        path.startsWith(prefix)
    );
}

export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError(401, "Unauthorized");
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as JwtPayload;

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, branchId: true, storeId: true, isActive: true },
        });

        if (!user || !user.isActive) {
            throw new AppError(401, "Unauthorized");
        }

        if (!isPlatformRole(user.role) && !user.storeId) {
            throw new AppError(403, "Your account is not assigned to any store");
        }

        if (user.storeId) {
            const billingState = await refreshStoreBillingState(user.storeId);
            assertStoreReadable(billingState);

            if (!READ_METHODS.has(req.method) && !isAuthSelfServicePath(req.path)) {
                assertStoreWritable(billingState);
            }
        }

        req.user = {
            id: user.id,
            role: user.role,
            storeId: user.storeId,
            branchId: user.branchId,
        };
        next();
    } catch (error) {
        if (error instanceof AppError) return next(error);
        next(new AppError(401, "Invalid or expired token"));
    }
}
