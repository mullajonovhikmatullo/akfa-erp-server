import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";

export function roleMiddleware(...roles: JwtPayload["role"][]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError(401, "Unauthorized"));
        }
        if (!roles.includes(req.user.role as JwtPayload["role"])) {
            return next(new AppError(403, "Forbidden: insufficient permissions"));
        }
        next();
    };
}
