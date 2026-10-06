import { NextFunction, Request, Response } from "express";
import { transferQuerySchema } from "../validations/transfer.validation";
import { TransfersService } from "../services/transfers.service";
import { idempotencyKeySchema } from "../../../core/services/idempotency.service";
import { paginationSchema } from "../../../core/utils/pagination";

export const TransfersController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const transfer = await TransfersService.create(req.body, req.user!, idempotencyKeySchema.parse(req.get("Idempotency-Key")));
            res.status(201).json({ success: true, data: transfer });
        } catch (err) {
            next(err);
        }
    },

    async complete(req: Request, res: Response, next: NextFunction) {
        try {
            const transfer = await TransfersService.complete(req.params.id as string, req.user!);
            res.json({ success: true, data: transfer });
        } catch (err) {
            next(err);
        }
    },

    async cancel(req: Request, res: Response, next: NextFunction) {
        try {
            const transfer = await TransfersService.cancel(req.params.id as string, req.user!);
            res.json({ success: true, data: transfer });
        } catch (err) {
            next(err);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const query = transferQuerySchema.parse(req.query);
            if (req.query.page !== undefined) {
                const { page, pageSize } = paginationSchema.parse(req.query);
                const result = await TransfersService.findSummaryPage(query, page, pageSize, req.user!);
                return res.json({ success: true, data: result });
            }
            const transfers = await TransfersService.findAll(query, req.user!);
            res.json({ success: true, data: transfers });
        } catch (err) {
            next(err);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const transfer = await TransfersService.findById(req.params.id as string, req.user!);
            res.json({ success: true, data: transfer });
        } catch (err) {
            next(err);
        }
    },
};
