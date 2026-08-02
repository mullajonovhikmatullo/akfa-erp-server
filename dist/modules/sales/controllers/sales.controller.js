"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const sale_validation_1 = require("../validations/sale.validation");
const sales_service_1 = require("../services/sales.service");
exports.SalesController = {
    async create(req, res, next) {
        try {
            const sale = await sales_service_1.SalesService.create(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, sale, "Sale recorded successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = sale_validation_1.saleQuerySchema.parse(req.query);
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await sales_service_1.SalesService.findPaginated(query, page, pageSize, req.user);
                return ApiResponse_1.ApiResponse.success(res, result);
            }
            const sales = await sales_service_1.SalesService.findAll(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, sales);
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const sale = await sales_service_1.SalesService.findById(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, sale);
        }
        catch (error) {
            next(error);
        }
    },
    async findDebtPayments(req, res, next) {
        try {
            const query = sale_validation_1.debtPaymentQuerySchema.parse(req.query);
            const result = await sales_service_1.SalesService.findDebtPayments(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    async addPayment(req, res, next) {
        try {
            const sale = await sales_service_1.SalesService.addPayment(req.params.id, req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, sale, "Payment recorded successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async setDebtDeadline(req, res, next) {
        try {
            const { debtDueDate } = req.body;
            const sale = await sales_service_1.SalesService.setDebtDeadline(req.params.id, debtDueDate ? new Date(debtDueDate) : null, req.user);
            return ApiResponse_1.ApiResponse.success(res, sale, "Debt deadline updated");
        }
        catch (error) {
            next(error);
        }
    },
};
