import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import {
    batchQuerySchema,
    inventoryQuerySchema,
    movementQuerySchema,
} from "../validations/inventory.validation";
import { z } from "zod";
import { InventoryService } from "../services/inventory.service";

export const InventoryController = {
    async stockIn(req: Request, res: Response, next: NextFunction) {
        try {
            const batch = await InventoryService.stockIn(req.body, req.user!);
            return ApiResponse.created(res, batch, "Stock received successfully");
        } catch (error) {
            next(error);
        }
    },

    async stockInBatch(req: Request, res: Response, next: NextFunction) {
        try {
            const batches = await InventoryService.stockInBatch(req.body, req.user!);
            return ApiResponse.created(res, batches, "Stock received successfully");
        } catch (error) {
            next(error);
        }
    },

    async adjust(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await InventoryService.adjust(req.body, req.user!);
            return ApiResponse.success(res, result, "Stock adjusted successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const query = inventoryQuerySchema.parse(req.query);
            const records = await InventoryService.findAll(query, req.user!);
            return ApiResponse.success(res, records);
        } catch (error) {
            next(error);
        }
    },

    async findMovements(req: Request, res: Response, next: NextFunction) {
        try {
            const query = movementQuerySchema.parse(req.query);
            const movements = await InventoryService.findMovements(query, req.user!);
            return ApiResponse.success(res, movements);
        } catch (error) {
            next(error);
        }
    },

    async findBatchesSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const query = batchQuerySchema.parse(req.query);
            const summary = await InventoryService.findBatchesSummary(query, req.user!);
            return ApiResponse.success(res, summary);
        } catch (error) {
            next(error);
        }
    },

    async findBatches(req: Request, res: Response, next: NextFunction) {
        try {
            const query = batchQuerySchema.parse(req.query);
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await InventoryService.findBatchesPaginated(query, page, pageSize, req.user!);
                return ApiResponse.success(res, result);
            }
            const batches = await InventoryService.findBatches(query, req.user!);
            return ApiResponse.success(res, batches);
        } catch (error) {
            next(error);
        }
    },

    async findReceipts(req: Request, res: Response, next: NextFunction) {
        try {
            const query = batchQuerySchema.parse(req.query);
            const page = Math.max(1, Number(req.query.page) || 1);
            const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
            const result = await InventoryService.findReceiptsPaginated(query, page, pageSize, req.user!);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    },

    async findReceiptItems(req: Request, res: Response, next: NextFunction) {
        try {
            const receiptId = z.string().uuid().parse(req.params.receiptId);
            const page = Math.max(1, Number(req.query.page) || 1);
            const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
            const result = await InventoryService.findReceiptItems(receiptId, page, pageSize, req.user!);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    },
};
