import { PaymentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { BillingService } from "../services/billing.service";
import { tenantPaymentQuerySchema } from "../validations/billing.validation";

export const BillingController = {
    async summary(req: Request, res: Response, next: NextFunction) {
        try {
            return ApiResponse.success(res, await BillingService.summary(req.user!));
        } catch (error) {
            return next(error);
        }
    },

    async listPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const query = tenantPaymentQuerySchema.parse(req.query) as { status?: PaymentStatus };
            return ApiResponse.success(
                res,
                await BillingService.listPayments(query.status, req.user!)
            );
        } catch (error) {
            return next(error);
        }
    },

    async submitPayment(req: Request, res: Response, next: NextFunction) {
        try {
            return ApiResponse.created(
                res,
                await BillingService.submitPayment(req.body, req.user!),
                "Payment submitted for platform approval"
            );
        } catch (error) {
            return next(error);
        }
    },
};
