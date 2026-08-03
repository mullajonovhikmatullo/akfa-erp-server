import { PaymentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { PlatformService } from "../services/platform.service";
import {
    createPaymentSchema,
    createPlanSchema,
    deletePlanSchema,
    listStoresQuerySchema,
    paymentStatusQuerySchema,
    regenerateOwnerSetupSchema,
    rejectPaymentSchema,
    updateStoreStatusSchema,
    updateStorePlanSchema,
    updatePlanSchema,
} from "../validations/platform.validation";
import { AuthService } from "../../auth/services/auth.service";

export const PlatformController = {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await AuthService.loginPlatform(req.body);
            return ApiResponse.success(res, data, "Login successful");
        } catch (error) {
            return next(error);
        }
    },

    async me(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await AuthService.me(req.user!.id);
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

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

    async provisionStore(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await PlatformService.provisionStore(req.body, req.user!);
            return ApiResponse.created(res, data, "Store tenant provisioned");
        } catch (error) {
            return next(error);
        }
    },

    async regenerateOwnerSetup(req: Request, res: Response, next: NextFunction) {
        try {
            const input = regenerateOwnerSetupSchema.parse(req.body);
            const data = await PlatformService.regenerateOwnerSetup(
                req.params.id as string,
                input,
                req.user!
            );
            return ApiResponse.success(res, data, "Owner setup link regenerated");
        } catch (error) {
            return next(error);
        }
    },

    async listPlans(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await PlatformService.listPlans();
            return ApiResponse.success(res, data);
        } catch (error) {
            return next(error);
        }
    },

    async listManagedPlans(_req: Request, res: Response, next: NextFunction) {
        try {
            return ApiResponse.success(res, await PlatformService.listManagedPlans());
        } catch (error) {
            return next(error);
        }
    },

    async createPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const input = createPlanSchema.parse(req.body);
            return ApiResponse.created(
                res,
                await PlatformService.createPlan(input, req.user!),
                "Plan created"
            );
        } catch (error) {
            return next(error);
        }
    },

    async updatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const input = updatePlanSchema.parse(req.body);
            return ApiResponse.success(
                res,
                await PlatformService.updatePlan(req.params.id as string, input, req.user!),
                "Plan updated"
            );
        } catch (error) {
            return next(error);
        }
    },

    async deletePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const input = deletePlanSchema.parse(req.body);
            return ApiResponse.success(
                res,
                await PlatformService.deletePlan(req.params.id as string, input, req.user!),
                "Plan removed"
            );
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

    async updateStorePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const input = updateStorePlanSchema.parse(req.body);
            const data = await PlatformService.updateStorePlan(req.params.id as string, input, req.user!);
            return ApiResponse.success(res, data, "Store plan updated");
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
