"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const analytics_validation_1 = require("../validations/analytics.validation");
const analytics_service_1 = require("../services/analytics.service");
exports.AnalyticsController = {
    async dashboard(req, res, next) {
        try {
            const query = analytics_validation_1.analyticsQuerySchema.parse(req.query);
            const data = await analytics_service_1.AnalyticsService.dashboard(query, req.user);
            res.json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    },
    async salesReport(req, res, next) {
        try {
            const query = analytics_validation_1.analyticsQuerySchema.parse(req.query);
            const data = await analytics_service_1.AnalyticsService.salesReport(query, req.user);
            res.json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    },
    async inventoryReport(req, res, next) {
        try {
            const query = analytics_validation_1.analyticsQuerySchema.parse(req.query);
            const data = await analytics_service_1.AnalyticsService.inventoryReport(query, req.user);
            res.json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    },
    async expenseReport(req, res, next) {
        try {
            const query = analytics_validation_1.analyticsQuerySchema.parse(req.query);
            const data = await analytics_service_1.AnalyticsService.expenseReport(query, req.user);
            res.json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    },
    async customerDebt(req, res, next) {
        try {
            const query = analytics_validation_1.analyticsQuerySchema.parse(req.query);
            const data = await analytics_service_1.AnalyticsService.customerDebt(query, req.user);
            res.json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    },
};
