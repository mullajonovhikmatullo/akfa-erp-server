"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const admin_validation_1 = require("../validations/admin.validation");
const admins_service_1 = require("../services/admins.service");
exports.AdminsController = {
    async create(req, res, next) {
        try {
            const admin = await admins_service_1.AdminsService.create(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, admin, "Admin created successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const filters = admin_validation_1.listAdminsSchema.parse(req.query);
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await admins_service_1.AdminsService.findPaginated({ ...filters, page, pageSize }, req.user);
                return ApiResponse_1.ApiResponse.success(res, result);
            }
            const admins = await admins_service_1.AdminsService.findAll(filters, req.user);
            return ApiResponse_1.ApiResponse.success(res, admins);
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const admin = await admins_service_1.AdminsService.findById(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, admin);
        }
        catch (error) {
            next(error);
        }
    },
    async update(req, res, next) {
        try {
            const admin = await admins_service_1.AdminsService.update(req.params.id, req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, admin, "Admin updated successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async disable(req, res, next) {
        try {
            const admin = await admins_service_1.AdminsService.disable(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, admin, "Admin disabled");
        }
        catch (error) {
            next(error);
        }
    },
    async enable(req, res, next) {
        try {
            const admin = await admins_service_1.AdminsService.enable(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, admin, "Admin enabled");
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            await admins_service_1.AdminsService.delete(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (error) {
            next(error);
        }
    },
};
