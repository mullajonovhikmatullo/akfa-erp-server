import { NextFunction, Request, Response } from "express";
import { transferQuerySchema } from "../validations/transfer.validation";
import { TransfersService } from "../services/transfers.service";

export const TransfersController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const transfer = await TransfersService.create(req.body, req.user!);
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
