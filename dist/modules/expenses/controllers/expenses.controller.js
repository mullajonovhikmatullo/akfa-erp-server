"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const expense_validation_1 = require("../validations/expense.validation");
const expenses_service_1 = require("../services/expenses.service");
exports.ExpensesController = {
    async create(req, res, next) {
        try {
            const expense = await expenses_service_1.ExpensesService.create(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, expense, "Expense recorded");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = expense_validation_1.expenseQuerySchema.parse(req.query);
            const expenses = await expenses_service_1.ExpensesService.findAll(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, expenses);
        }
        catch (error) {
            next(error);
        }
    },
    async categorySummary(req, res, next) {
        try {
            const query = expense_validation_1.expenseCategorySummaryQuerySchema.parse(req.query);
            const summary = await expenses_service_1.ExpensesService.categorySummary(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, summary);
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const expense = await expenses_service_1.ExpensesService.findById(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.success(res, expense);
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            await expenses_service_1.ExpensesService.delete(req.params.id, req.user);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (error) {
            next(error);
        }
    },
};
