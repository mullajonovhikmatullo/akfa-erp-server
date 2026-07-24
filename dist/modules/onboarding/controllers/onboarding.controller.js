"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const onboarding_service_1 = require("../services/onboarding.service");
exports.OnboardingController = {
    async registerStore(req, res, next) {
        try {
            const result = await onboarding_service_1.OnboardingService.registerStore(req.body);
            return ApiResponse_1.ApiResponse.created(res, result, "Store trial created successfully");
        }
        catch (error) {
            return next(error);
        }
    },
};
