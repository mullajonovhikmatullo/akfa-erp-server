import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import {
    expenseCategorySummaryQuerySchema,
    expenseQuerySchema,
} from "../validations/expense.validation";
import { ExpensesService } from "../services/expenses.service";

export const ExpensesController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const expense = await ExpensesService.create(req.body, req.user!);
            return ApiResponse.created(res, expense, "Expense recorded");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const query = expenseQuerySchema.parse(req.query);
            const expenses = await ExpensesService.findAll(query, req.user!);
            return ApiResponse.success(res, expenses);
        } catch (error) {
            next(error);
        }
    },

    async categorySummary(req: Request, res: Response, next: NextFunction) {
        try {
            const query = expenseCategorySummaryQuerySchema.parse(req.query);
            const summary = await ExpensesService.categorySummary(query, req.user!);
            return ApiResponse.success(res, summary);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const expense = await ExpensesService.findById(req.params.id as string, req.user!);
            return ApiResponse.success(res, expense);
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await ExpensesService.delete(req.params.id as string, req.user!);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
