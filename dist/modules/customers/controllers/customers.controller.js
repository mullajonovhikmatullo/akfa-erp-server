"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const customer_validation_1 = require("../validations/customer.validation");
const customers_service_1 = require("../services/customers.service");
exports.CustomersController = {
    async create(req, res, next) {
        try {
            const customer = await customers_service_1.CustomersService.create(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, customer, "Customer created successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = customer_validation_1.customerQuerySchema.parse(req.query);
            const customers = await customers_service_1.CustomersService.findAll(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, customers);
        }
        catch (error) {
            next(error);
        }
    },
    async checkPhone(req, res, next) {
        try {
            const query = customer_validation_1.customerPhoneCheckSchema.parse(req.query);
            return ApiResponse_1.ApiResponse.success(res, await customers_service_1.CustomersService.checkPhone(query.phone, query.branchId, req.user));
        }
        catch (error) {
            next(error);
        }
    },
    async linkBranch(req, res, next) {
        try {
            const body = customer_validation_1.linkCustomerBranchSchema.parse(req.body);
            return ApiResponse_1.ApiResponse.success(res, await customers_service_1.CustomersService.linkBranch(req.params.id, body.branchId, req.user));
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const customer = await customers_service_1.CustomersService.findById(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, customer);
        }
        catch (error) {
            next(error);
        }
    },
    async update(req, res, next) {
        try {
            const customer = await customers_service_1.CustomersService.update(req.params.id, req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, customer, "Customer updated successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            await customers_service_1.CustomersService.delete(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (error) {
            next(error);
        }
    },
};
