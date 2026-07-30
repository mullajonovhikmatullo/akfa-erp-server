"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const analytics_controller_1 = require("./controllers/analytics.controller");
const role_middleware_1 = require("../auth/middleware/role.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN", "BRANCH_ADMIN", "ADMIN"));
/**
 * @swagger
 * components:
 *   schemas:
 *     AnalyticsPeriod:
 *       type: string
 *       enum: [day, week, month]
 *       default: day
 */
/**
 * @swagger
 * /analytics/dashboard:
 *   get:
 *     summary: Top-level KPIs for a date range
 *     description: |
 *       Returns aggregated sales, expenses, net profit, inventory value,
 *       low-stock count, customer debt, and pending transfers.
 *       ADMIN sees their branch only; STORE_OWNER sees all or a specific branch.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *         description: STORE_OWNER only
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Defaults to the first day of the current month
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Defaults to now
 *     responses:
 *       200:
 *         description: Dashboard KPIs
 */
router.get("/dashboard", analytics_controller_1.AnalyticsController.dashboard);
/**
 * @swagger
 * /analytics/sales:
 *   get:
 *     summary: Sales breakdown — by period, type, payment method, and top products
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: period
 *         schema:
 *           $ref: '#/components/schemas/AnalyticsPeriod'
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *         description: Number of top products to return
 *     responses:
 *       200:
 *         description: Sales report
 */
router.get("/sales", analytics_controller_1.AnalyticsController.salesReport);
/**
 * @swagger
 * /analytics/inventory:
 *   get:
 *     summary: Inventory report — stock value per branch, low-stock items, movement summary
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Used to scope the stock-movement summary
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Inventory report
 */
router.get("/inventory", analytics_controller_1.AnalyticsController.inventoryReport);
/**
 * @swagger
 * /analytics/expenses:
 *   get:
 *     summary: Expense breakdown — totals by category and over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: period
 *         schema:
 *           $ref: '#/components/schemas/AnalyticsPeriod'
 *     responses:
 *       200:
 *         description: Expense report
 */
router.get("/expenses", analytics_controller_1.AnalyticsController.expenseReport);
/**
 * @swagger
 * /analytics/customers/debt:
 *   get:
 *     summary: Customer debt summary — total outstanding, overdue breakdown, and top debtors
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200:
 *         description: Customer debt report
 */
router.get("/customers/debt", analytics_controller_1.AnalyticsController.customerDebt);
exports.default = router;
