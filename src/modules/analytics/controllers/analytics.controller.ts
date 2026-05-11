import { NextFunction, Request, Response } from "express";
import { analyticsQuerySchema } from "../validations/analytics.validation";
import { AnalyticsService } from "../services/analytics.service";

export const AnalyticsController = {
    async dashboard(req: Request, res: Response, next: NextFunction) {
        try {
            const query = analyticsQuerySchema.parse(req.query);
            const data = await AnalyticsService.dashboard(query, req.user!);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    async salesReport(req: Request, res: Response, next: NextFunction) {
        try {
            const query = analyticsQuerySchema.parse(req.query);
            const data = await AnalyticsService.salesReport(query, req.user!);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    async inventoryReport(req: Request, res: Response, next: NextFunction) {
        try {
            const query = analyticsQuerySchema.parse(req.query);
            const data = await AnalyticsService.inventoryReport(query, req.user!);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    async expenseReport(req: Request, res: Response, next: NextFunction) {
        try {
            const query = analyticsQuerySchema.parse(req.query);
            const data = await AnalyticsService.expenseReport(query, req.user!);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    async customerDebt(req: Request, res: Response, next: NextFunction) {
        try {
            const query = analyticsQuerySchema.parse(req.query);
            const data = await AnalyticsService.customerDebt(query, req.user!);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },
};
