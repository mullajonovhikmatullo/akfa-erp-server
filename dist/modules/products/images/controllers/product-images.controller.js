"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductImagesController = void 0;
const ApiResponse_1 = require("../../../../core/response/ApiResponse");
const product_images_service_1 = require("../services/product-images.service");
exports.ProductImagesController = {
    async upload(req, res, next) {
        try {
            const files = (req.files ?? []);
            const images = await product_images_service_1.ProductImagesService.upload(req.params.productId, files, req.user);
            return ApiResponse_1.ApiResponse.created(res, images, "Product images uploaded");
        }
        catch (error) {
            next(error);
        }
    },
    async list(req, res, next) {
        try {
            const images = await product_images_service_1.ProductImagesService.list(req.params.productId, req.user);
            return ApiResponse_1.ApiResponse.success(res, images);
        }
        catch (error) {
            next(error);
        }
    },
    async replace(req, res, next) {
        try {
            const files = (req.files ?? []);
            const images = await product_images_service_1.ProductImagesService.replace(req.params.productId, req.params.imageId, files, req.user);
            return ApiResponse_1.ApiResponse.success(res, images, "Product image replaced");
        }
        catch (error) {
            next(error);
        }
    },
    async setPrimary(req, res, next) {
        try {
            const images = await product_images_service_1.ProductImagesService.setPrimary(req.params.productId, req.params.imageId, req.user);
            return ApiResponse_1.ApiResponse.success(res, images, "Primary image updated");
        }
        catch (error) {
            next(error);
        }
    },
    async reorder(req, res, next) {
        try {
            const images = await product_images_service_1.ProductImagesService.reorder(req.params.productId, req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, images, "Product images reordered");
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            const images = await product_images_service_1.ProductImagesService.delete(req.params.productId, req.params.imageId, req.user);
            return ApiResponse_1.ApiResponse.success(res, images, "Product image deleted");
        }
        catch (error) {
            next(error);
        }
    },
    async file(req, res, next) {
        try {
            const file = await product_images_service_1.ProductImagesService.readFile(req.params.storeId, req.params.productId, req.params.imageId, req.params.fileName, req.user);
            res.setHeader("Content-Type", file.mimeType);
            res.setHeader("Content-Length", String(file.content.length));
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "private, max-age=3600");
            res.setHeader("Vary", "Authorization");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("X-Content-Type-Options", "nosniff");
            return res.send(file.content);
        }
        catch (error) {
            next(error);
        }
    },
};
