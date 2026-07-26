"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const platform_service_1 = require("../services/platform.service");
const platform_validation_1 = require("../validations/platform.validation");
const auth_service_1 = require("../../auth/services/auth.service");
exports.PlatformController = {
    async login(req, res, next) {
        try {
            const data = await auth_service_1.AuthService.loginPlatform(req.body);
            return ApiResponse_1.ApiResponse.success(res, data, "Login successful");
        }
        catch (error) {
            return next(error);
        }
    },
    async me(req, res, next) {
        try {
            const data = await auth_service_1.AuthService.me(req.user.id);
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async dashboard(_req, res, next) {
        try {
            const data = await platform_service_1.PlatformService.dashboard();
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async listStores(req, res, next) {
        try {
            const query = platform_validation_1.listStoresQuerySchema.parse(req.query);
            const data = await platform_service_1.PlatformService.listStores(query);
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async provisionStore(req, res, next) {
        try {
            const data = await platform_service_1.PlatformService.provisionStore(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, data, "Store tenant provisioned");
        }
        catch (error) {
            return next(error);
        }
    },
    async regenerateOwnerSetup(req, res, next) {
        try {
            const input = platform_validation_1.regenerateOwnerSetupSchema.parse(req.body);
            const data = await platform_service_1.PlatformService.regenerateOwnerSetup(req.params.id, input, req.user);
            return ApiResponse_1.ApiResponse.success(res, data, "Owner setup link regenerated");
        }
        catch (error) {
            return next(error);
        }
    },
    async listPlans(_req, res, next) {
        try {
            const data = await platform_service_1.PlatformService.listPlans();
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async listManagedPlans(_req, res, next) {
        try {
            return ApiResponse_1.ApiResponse.success(res, await platform_service_1.PlatformService.listManagedPlans());
        }
        catch (error) {
            return next(error);
        }
    },
    async createPlan(req, res, next) {
        try {
            const input = platform_validation_1.createPlanSchema.parse(req.body);
            return ApiResponse_1.ApiResponse.created(res, await platform_service_1.PlatformService.createPlan(input, req.user), "Plan created");
        }
        catch (error) {
            return next(error);
        }
    },
    async updatePlan(req, res, next) {
        try {
            const input = platform_validation_1.updatePlanSchema.parse(req.body);
            return ApiResponse_1.ApiResponse.success(res, await platform_service_1.PlatformService.updatePlan(req.params.id, input, req.user), "Plan updated");
        }
        catch (error) {
            return next(error);
        }
    },
    async deletePlan(req, res, next) {
        try {
            const input = platform_validation_1.deletePlanSchema.parse(req.body);
            return ApiResponse_1.ApiResponse.success(res, await platform_service_1.PlatformService.deletePlan(req.params.id, input, req.user), "Plan removed");
        }
        catch (error) {
            return next(error);
        }
    },
    async findStoreById(req, res, next) {
        try {
            const data = await platform_service_1.PlatformService.findStoreById(req.params.id);
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async updateStoreStatus(req, res, next) {
        try {
            const input = platform_validation_1.updateStoreStatusSchema.parse(req.body);
            const data = await platform_service_1.PlatformService.updateStoreStatus(req.params.id, input, req.user);
            return ApiResponse_1.ApiResponse.success(res, data, "Store status updated");
        }
        catch (error) {
            return next(error);
        }
    },
    async listPayments(req, res, next) {
        try {
            const { status } = platform_validation_1.paymentStatusQuerySchema.parse(req.query);
            const data = await platform_service_1.PlatformService.listPayments(status);
            return ApiResponse_1.ApiResponse.success(res, data);
        }
        catch (error) {
            return next(error);
        }
    },
    async createPayment(req, res, next) {
        try {
            const input = platform_validation_1.createPaymentSchema.parse(req.body);
            const data = await platform_service_1.PlatformService.createPayment(input, req.user);
            return ApiResponse_1.ApiResponse.created(res, data, "Payment created");
        }
        catch (error) {
            return next(error);
        }
    },
    async approvePayment(req, res, next) {
        try {
            const data = await platform_service_1.PlatformService.approvePayment(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, data, "Payment approved");
        }
        catch (error) {
            return next(error);
        }
    },
    async rejectPayment(req, res, next) {
        try {
            const input = platform_validation_1.rejectPaymentSchema.parse(req.body);
            const data = await platform_service_1.PlatformService.rejectPayment(req.params.id, input, req.user);
            return ApiResponse_1.ApiResponse.success(res, data, "Payment rejected");
        }
        catch (error) {
            return next(error);
        }
    },
};
