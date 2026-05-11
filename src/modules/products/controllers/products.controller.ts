import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { listProductsSchema } from "../validations/product.validation";
import { ProductsService } from "../services/products.service";

export const ProductsController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await ProductsService.create(req.body);
            return ApiResponse.created(res, product, "Product created successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const filters = listProductsSchema.parse(req.query);
            const products = await ProductsService.findAll(filters);
            return ApiResponse.success(res, products);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await ProductsService.findById(req.params.id as string);
            return ApiResponse.success(res, product);
        } catch (error) {
            next(error);
        }
    },

    async findBySku(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await ProductsService.findBySku(req.params.sku as string);
            return ApiResponse.success(res, product);
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await ProductsService.update(req.params.id as string, req.body);
            return ApiResponse.success(res, product, "Product updated successfully");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await ProductsService.delete(req.params.id as string);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
