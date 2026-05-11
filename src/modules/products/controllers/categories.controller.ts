import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { CategoriesService } from "../services/categories.service";

export const CategoriesController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.create(req.body);
            return ApiResponse.created(res, category, "Category created successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const isActive =
                req.query.isActive === undefined ? undefined : req.query.isActive === "true";
            const categories = await CategoriesService.findAll(isActive);
            return ApiResponse.success(res, categories);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.findById(req.params.id as string);
            return ApiResponse.success(res, category);
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await CategoriesService.update(req.params.id as string, req.body);
            return ApiResponse.success(res, category, "Category updated successfully");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await CategoriesService.delete(req.params.id as string);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
