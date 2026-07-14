"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const product_validation_1 = require("../validations/product.validation");
const products_service_1 = require("../services/products.service");
exports.ProductsController = {
    async create(req, res, next) {
        try {
            const product = await products_service_1.ProductsService.create(req.body);
            return ApiResponse_1.ApiResponse.created(res, product, "Product created successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const filters = product_validation_1.listProductsSchema.parse(req.query);
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await products_service_1.ProductsService.findPaginated({ ...filters, page, pageSize });
                return ApiResponse_1.ApiResponse.success(res, result);
            }
            const products = await products_service_1.ProductsService.findAll(filters);
            return ApiResponse_1.ApiResponse.success(res, products);
        }
        catch (error) {
            next(error);
        }
    },
    async findById(req, res, next) {
        try {
            const product = await products_service_1.ProductsService.findById(req.params.id);
            return ApiResponse_1.ApiResponse.success(res, product);
        }
        catch (error) {
            next(error);
        }
    },
    async findBySku(req, res, next) {
        try {
            const product = await products_service_1.ProductsService.findBySku(req.params.sku);
            return ApiResponse_1.ApiResponse.success(res, product);
        }
        catch (error) {
            next(error);
        }
    },
    async update(req, res, next) {
        try {
            const product = await products_service_1.ProductsService.update(req.params.id, req.body);
            return ApiResponse_1.ApiResponse.success(res, product, "Product updated successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            await products_service_1.ProductsService.delete(req.params.id);
            return ApiResponse_1.ApiResponse.noContent(res);
        }
        catch (error) {
            next(error);
        }
    },
};
