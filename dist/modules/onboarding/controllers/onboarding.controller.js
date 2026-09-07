"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const onboarding_service_1 = require("../services/onboarding.service");
const pagination_1 = require("../../../core/utils/pagination");
exports.OnboardingController = {
    async listPlans(req, res, next) {
        try {
            const result = await onboarding_service_1.OnboardingService.listPublicPlans(pagination_1.listWindowSchema.parse(req.query));
            return ApiResponse_1.ApiResponse.success(res, result);
        }
        catch (error) {
            return next(error);
        }
    },
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
