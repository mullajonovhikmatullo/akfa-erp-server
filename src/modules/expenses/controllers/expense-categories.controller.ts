import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { ExpenseCategoriesService } from "../services/expense-categories.service";

export const ExpenseCategoriesController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await ExpenseCategoriesService.create(req.body);
            return ApiResponse.created(res, category, "Expense category created");
        } catch (err) {
            next(err);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const includeInactive = req.query.includeInactive === "true";
            const categories = await ExpenseCategoriesService.findAll(includeInactive);
            return ApiResponse.success(res, categories);
        } catch (err) {
            next(err);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await ExpenseCategoriesService.findById(req.params.id as string);
            return ApiResponse.success(res, category);
        } catch (err) {
            next(err);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await ExpenseCategoriesService.update(
                req.params.id as string,
                req.body
            );
            return ApiResponse.success(res, category, "Expense category updated");
        } catch (err) {
            next(err);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await ExpenseCategoriesService.delete(req.params.id as string);
            return ApiResponse.noContent(res);
        } catch (err) {
            next(err);
        }
    },
};
