"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const pagination_1 = require("../../../core/utils/pagination");
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const inventory_validation_1 = require("../validations/inventory.validation");
const zod_1 = require("zod");
const inventory_service_1 = require("../services/inventory.service");
const idempotency_service_1 = require("../../../core/services/idempotency.service");
exports.InventoryController = {
    async stockIn(req, res, next) {
        try {
            const batch = await inventory_service_1.InventoryService.stockIn(req.body, req.user, idempotency_service_1.idempotencyKeySchema.parse(req.get("Idempotency-Key")));
            return ApiResponse_1.ApiResponse.created(res, batch, "Stock received successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async stockInBatch(req, res, next) {
        try {
            const batches = await inventory_service_1.InventoryService.stockInBatch(req.body, req.user, idempotency_service_1.idempotencyKeySchema.parse(req.get("Idempotency-Key")));
            return ApiResponse_1.ApiResponse.created(res, batches, "Stock received successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async adjust(req, res, next) {
        try {
            const result = await inventory_service_1.InventoryService.adjust(req.body, req.user, idempotency_service_1.idempotencyKeySchema.parse(req.get("Idempotency-Key")));
            return ApiResponse_1.ApiResponse.success(res, result, "Stock adjusted successfully");
        }
        catch (error) {
            next(error);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = inventory_validation_1.inventoryQuerySchema.parse({ ...req.query, ...(req.path === "/low-stock" && { lowStock: "true" }) });
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
    async findBatchesSummary(req, res, next) {
        try {
            const query = inventory_validation_1.batchQuerySchema.parse(req.query);
            const summary = await inventory_service_1.InventoryService.findBatchesSummary(query, req.user);
            return ApiResponse_1.ApiResponse.success(res, summary);
        }
        catch (error) {
            next(error);
        }
    },
    async findBatches(req, res, next) {
        try {
            const query = inventory_validation_1.batchQuerySchema.parse(req.query);
            if (req.query.page !== undefined) {
                const { page, pageSize } = pagination_1.paginationSchema.parse(req.query);
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
    async findReceipts(req, res, next) {
        try {
            const query = inventory_validation_1.batchQuerySchema.parse(req.query);
            const { page, pageSize } = pagination_1.paginationSchema.parse(req.query);
            const result = await inventory_service_1.InventoryService.findReceiptsPaginated(query, page, pageSize, req.user);
            return ApiResponse_1.ApiResponse.success(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    async findReceiptItems(req, res, next) {
        try {
            const receiptId = zod_1.z.string().uuid().parse(req.params.receiptId);
            const { page, pageSize } = pagination_1.paginationSchema.extend({ pageSize: (0, pagination_1.queryInteger)(25, 100) }).parse(req.query);
            const result = await inventory_service_1.InventoryService.findReceiptItems(receiptId, page, pageSize, req.user);
            return ApiResponse_1.ApiResponse.success(res, result);
        }
        catch (error) {
            next(error);
        }
    },
};
