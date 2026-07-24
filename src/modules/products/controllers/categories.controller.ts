import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { CategoriesService } from "../services/categories.service";

export const CategoriesController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.create(req.body, req.user!);
            return ApiResponse.created(res, category, "Category created successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const isActive =
                req.query.isActive === undefined ? undefined : req.query.isActive === "true";

            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await CategoriesService.findPaginated({ page, pageSize, isActive, user: req.user! });
                return ApiResponse.success(res, result);
            }

            const categories = await CategoriesService.findAll(isActive, req.user!);
            return ApiResponse.success(res, categories);
        } catch (error) {
            next(error);
        }
    },

    async summary(req: Request, res: Response, next: NextFunction) {
        try {
            const summary = await CategoriesService.summary(req.user!);
            return ApiResponse.success(res, summary);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.findById(req.params.id as string, req.user!);
            return ApiResponse.success(res, category);
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.update(req.params.id as string, req.body, req.user!);
            return ApiResponse.success(res, category, "Category updated successfully");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await CategoriesService.delete(req.params.id as string, req.user!);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
