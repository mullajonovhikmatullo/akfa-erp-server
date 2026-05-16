import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { AuthService, updateProfileSchema, changePasswordSchema } from "../services/auth.service";
import { AppError } from "../../../core/errors/AppError";

export const AuthController = {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AuthService.login(req.body);
            return ApiResponse.success(res, result, "Login successful");
        } catch (error) {
            next(error);
        }
    },

    async me(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AuthService.me(req.user!.id);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    },

    async updateProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = updateProfileSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new AppError(422, parsed.error.issues[0]?.message ?? "Validation error");
            }
            const result = await AuthService.updateProfile(req.user!.id, parsed.data);
            return ApiResponse.success(res, result, "Profil yangilandi");
        } catch (error) {
            next(error);
        }
    },

    async changePassword(req: Request, res: Response, next: NextFunction) {
        try {
            const parsed = changePasswordSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new AppError(422, parsed.error.issues[0]?.message ?? "Validation error");
            }
            const result = await AuthService.changePassword(req.user!.id, parsed.data);
            return ApiResponse.success(res, result, result.message);
        } catch (error) {
            next(error);
        }
    },
};
