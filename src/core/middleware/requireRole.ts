import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError";

export function requireRole(...roles: UserRole[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role as UserRole)) {
            return next(new AppError(403, "Forbidden"));
        }
        next();
    };
}
