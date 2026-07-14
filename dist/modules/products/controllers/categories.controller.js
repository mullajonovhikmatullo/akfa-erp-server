"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const categories_service_1 = require("../services/categories.service");
exports.CategoriesController = {
    async create(req, res, next) {
        try {
            const category = await categories_service_1.CategoriesService.create(req.body);
            return ApiResponse_1.ApiResponse.created(res, category, "Category created successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const isActive = req.query.isActive === undefined ? undefined : req.query.isActive === "true";
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await categories_service_1.CategoriesService.findPaginated({ page, pageSize, isActive });
                return ApiResponse_1.ApiResponse.success(res, result);
            }
            const categories = await categories_service_1.CategoriesService.findAll(isActive);
            return ApiResponse_1.ApiResponse.success(res, categories);
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const category = await categories_service_1.CategoriesService.findById(req.params.id);
            return ApiResponse_1.ApiResponse.success(res, category);
        }
        catch (error) {
            next(error);
        }
    },
    async update(req, res, next) {
        try {
            const category = await categories_service_1.CategoriesService.update(req.params.id, req.body);
            return ApiResponse_1.ApiResponse.success(res, category, "Category updated successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            await categories_service_1.CategoriesService.delete(req.params.id);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (error) {
            next(error);
        }
    },
};
