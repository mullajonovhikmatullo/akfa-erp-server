"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const platform_service_1 = require("../services/platform.service");
const platform_validation_1 = require("../validations/platform.validation");
exports.PlatformController = {
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
