import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { AuthService } from "../services/auth.service";

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
};
