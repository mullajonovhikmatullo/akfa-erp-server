import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../../core/response/ApiResponse";
import { ProductImagesService } from "../services/product-images.service";

export const ProductImagesController = {
    async upload(req: Request, res: Response, next: NextFunction) {
        try {
            const files = (req.files ?? []) as Express.Multer.File[];
            const images = await ProductImagesService.upload(
                req.params.productId as string,
                files,
                req.user!
            );
            return ApiResponse.created(res, images, "Product images uploaded");
        } catch (error) {
            next(error);
        }
    },

    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const images = await ProductImagesService.list(
                req.params.productId as string,
                req.user!
            );
            return ApiResponse.success(res, images);
        } catch (error) {
            next(error);
        }
    },

    async replace(req: Request, res: Response, next: NextFunction) {
        try {
            const files = (req.files ?? []) as Express.Multer.File[];
            const images = await ProductImagesService.replace(
                req.params.productId as string,
                req.params.imageId as string,
                files,
                req.user!
            );
            return ApiResponse.success(res, images, "Product image replaced");
        } catch (error) {
            next(error);
        }
    },

    async setPrimary(req: Request, res: Response, next: NextFunction) {
        try {
            const images = await ProductImagesService.setPrimary(
                req.params.productId as string,
                req.params.imageId as string,
                req.user!
            );
            return ApiResponse.success(res, images, "Primary image updated");
        } catch (error) {
            next(error);
        }
    },

    async reorder(req: Request, res: Response, next: NextFunction) {
        try {
            const images = await ProductImagesService.reorder(
                req.params.productId as string,
                req.body,
                req.user!
            );
            return ApiResponse.success(res, images, "Product images reordered");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const images = await ProductImagesService.delete(
                req.params.productId as string,
                req.params.imageId as string,
                req.user!
            );
            return ApiResponse.success(res, images, "Product image deleted");
        } catch (error) {
            next(error);
        }
    },

    async file(req: Request, res: Response, next: NextFunction) {
        try {
            const file = await ProductImagesService.readFile(
                req.params.storeId as string,
                req.params.productId as string,
                req.params.imageId as string,
                req.params.fileName as string,
                req.user!
            );
            res.setHeader("Content-Type", file.mimeType);
            res.setHeader("Content-Length", String(file.content.length));
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "private, max-age=3600");
            res.setHeader("Vary", "Authorization");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("X-Content-Type-Options", "nosniff");
            return res.send(file.content);
        } catch (error) {
            next(error);
        }
    },
};
