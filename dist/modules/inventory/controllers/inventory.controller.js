"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const inventory_validation_1 = require("../validations/inventory.validation");
const inventory_service_1 = require("../services/inventory.service");
exports.InventoryController = {
    async stockIn(req, res, next) {
        try {
            const batch = await inventory_service_1.InventoryService.stockIn(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, batch, "Stock received successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async stockInBatch(req, res, next) {
        try {
            const batches = await inventory_service_1.InventoryService.stockInBatch(req.body, req.user);
            return ApiResponse_1.ApiResponse.created(res, batches, "Stock received successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async adjust(req, res, next) {
        try {
            const result = await inventory_service_1.InventoryService.adjust(req.body, req.user);
            return ApiResponse_1.ApiResponse.success(res, result, "Stock adjusted successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = inventory_validation_1.inventoryQuerySchema.parse(req.query);
            const records = await inventory_service_1.InventoryService.findAll(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, records);
        }
        catch (error) {
            next(error);
        }
    },
    async findMovements(req, res, next) {
        try {
            const query = inventory_validation_1.movementQuerySchema.parse(req.query);
            const movements = await inventory_service_1.InventoryService.findMovements(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, movements);
        }
        catch (error) {
            next(error);
        }
    },
    async findBatches(req, res, next) {
        try {
            const query = inventory_validation_1.batchQuerySchema.parse(req.query);
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await inventory_service_1.InventoryService.findBatchesPaginated(query, page, pageSize, req.user);
                return ApiResponse_1.ApiResponse.success(res, result);
            }
            const batches = await inventory_service_1.InventoryService.findBatches(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, batches);
        }
        catch (error) {
            next(error);
        }
    },
};
