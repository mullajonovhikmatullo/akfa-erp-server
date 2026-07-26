import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { OnboardingService } from "../services/onboarding.service";

export const OnboardingController = {
    async listPlans(_req: Request, res: Response, next: NextFunction) {
        try {
            const result = await OnboardingService.listPublicPlans();
            return ApiResponse.success(res, result);
        } catch (error) {
            return next(error);
        }
    },

    async registerStore(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await OnboardingService.registerStore(req.body);
            return ApiResponse.created(res, result, "Store trial created successfully");
        } catch (error) {
            return next(error);
        }
    },
};
