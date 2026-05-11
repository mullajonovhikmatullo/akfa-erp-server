import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { saleQuerySchema } from "../validations/sale.validation";
import { SalesService } from "../services/sales.service";

export const SalesController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const sale = await SalesService.create(req.body, req.user!);
            return ApiResponse.created(res, sale, "Sale recorded successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const query = saleQuerySchema.parse(req.query);
            const sales = await SalesService.findAll(query, req.user!);
            return ApiResponse.success(res, sales);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const sale = await SalesService.findById(req.params.id as string, req.user!);
            return ApiResponse.success(res, sale);
        } catch (error) {
            next(error);
        }
    },

    async addPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const sale = await SalesService.addPayment(
                req.params.id as string,
                req.body,
                req.user!
            );
            return ApiResponse.success(res, sale, "Payment recorded successfully");
        } catch (error) {
            next(error);
        }
    },

    async setDebtDeadline(req: Request, res: Response, next: NextFunction) {
        try {
            const { debtDueDate } = req.body as { debtDueDate: string | null };
            const sale = await SalesService.setDebtDeadline(
                req.params.id as string,
                debtDueDate ? new Date(debtDueDate) : null,
                req.user!
            );
            return ApiResponse.success(res, sale, "Debt deadline updated");
        } catch (error) {
            next(error);
        }
    },
};
