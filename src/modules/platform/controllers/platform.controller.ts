import { PaymentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { PlatformService } from "../services/platform.service";
import {
    createPaymentSchema,
    listStoresQuerySchema,
    paymentStatusQuerySchema,
    rejectPaymentSchema,
    updateStoreStatusSchema,
} from "../validations/platform.validation";

export const PlatformController = {
    async dashboard(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await PlatformService.dashboard();
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

    async listStores(req: Request, res: Response, next: NextFunction) {
        try {
            const query = listStoresQuerySchema.parse(req.query);
            const data = await PlatformService.listStores(query);
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

    async findStoreById(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await PlatformService.findStoreById(req.params.id as string);
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

    async updateStoreStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const input = updateStoreStatusSchema.parse(req.body);
            const data = await PlatformService.updateStoreStatus(req.params.id as string, input, req.user!);
            return ApiResponse.success(res, data, "Store status updated");
        } catch (error) {
            return next(error);
        }
    },

    async listPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const { status } = paymentStatusQuerySchema.parse(req.query) as { status?: PaymentStatus };
            const data = await PlatformService.listPayments(status);
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

    async createPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const input = createPaymentSchema.parse(req.body);
            const data = await PlatformService.createPayment(input, req.user!);
            return ApiResponse.created(res, data, "Payment created");
        } catch (error) {
            return next(error);
        }
    },

    async approvePayment(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await PlatformService.approvePayment(req.params.id as string, req.user!);
            return ApiResponse.success(res, data, "Payment approved");
        } catch (error) {
            return next(error);
        }
    },

    async rejectPayment(req: Request, res: Response, next: NextFunction) {
        try {
            const input = rejectPaymentSchema.parse(req.body);
            const data = await PlatformService.rejectPayment(req.params.id as string, input, req.user!);
            return ApiResponse.success(res, data, "Payment rejected");
        } catch (error) {
            return next(error);
        }
    },
};
