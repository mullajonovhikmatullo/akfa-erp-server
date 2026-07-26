"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const billing_service_1 = require("../services/billing.service");
const billing_validation_1 = require("../validations/billing.validation");
exports.BillingController = {
    async summary(req, res, next) {
        try {
            return ApiResponse_1.ApiResponse.success(res, await billing_service_1.BillingService.summary(req.user));
        }
        catch (error) {
            return next(error);
        }
    },
    async listPayments(req, res, next) {
        try {
            const query = billing_validation_1.tenantPaymentQuerySchema.parse(req.query);
            return ApiResponse_1.ApiResponse.success(res, await billing_service_1.BillingService.listPayments(query.status, req.user));
        }
        catch (error) {
            return next(error);
        }
    },
    async submitPayment(req, res, next) {
        try {
            return ApiResponse_1.ApiResponse.created(res, await billing_service_1.BillingService.submitPayment(req.body, req.user), "Payment submitted for platform approval");
        }
        catch (error) {
            return next(error);
        }
    },
};
