"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseCategoriesController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const expense_categories_service_1 = require("../services/expense-categories.service");
exports.ExpenseCategoriesController = {
    async create(req, res, next) {
        try {
            const category = await expense_categories_service_1.ExpenseCategoriesService.create(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, category, "Expense category created");
        }
        catch (err) {
            next(err);
        }
    },
    async findAll(req, res, next) {
        try {
            const includeInactive = req.query.includeInactive === "true";
            const categories = await expense_categories_service_1.ExpenseCategoriesService.findAll(includeInactive, req.user);
            return ApiResponse_1.ApiResponse.success(res, categories);
        }
        catch (err) {
            next(err);
        }
    },
    async findById(req, res, next) {
        try {
            const category = await expense_categories_service_1.ExpenseCategoriesService.findById(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, category);
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        try {
            const category = await expense_categories_service_1.ExpenseCategoriesService.update(req.params.id, req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, category, "Expense category updated");
        }
        catch (err) {
            next(err);
        }
    },
    async delete(req, res, next) {
        try {
            await expense_categories_service_1.ExpenseCategoriesService.delete(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (err) {
            next(err);
        }
    },
};
