import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate";
import { createSaleSchema, addPaymentSchema, setDebtDeadlineSchema } from "./validations/sale.validation";
import { SalesController } from "./controllers/sales.controller";

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * components:
 *   schemas:
 *     SaleType:
 *       type: string
 *       enum: [RETAIL, WHOLESALE]
 *     PaymentMethod:
 *       type: string
 *       enum: [CASH_UZS, CASH_USD, CARD, TRANSFER, MIXED, CREDIT]
 *     SaleItemRequest:
 *       type: object
 *       required: [productId, quantity]
 *       properties:
 *         productId:
 *           type: string
 *           format: uuid
 *         quantity:
 *           type: number
 *           example: 5
 *     CreateSaleRequest:
 *       type: object
 *       required: [saleType, items, paymentMethod]
 *       properties:
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Optional. Defaults to the authenticated user's branch; ADMIN cannot override it.
 *         customerId:
 *           type: string
 *           format: uuid
 *           description: Required when paidAmountUzs < totalAmount (creates debt)
 *         saleType:
 *           $ref: '#/components/schemas/SaleType'
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SaleItemRequest'
 *         paidAmountUzs:
 *           type: number
 *           default: 0
 *           example: 200000
 *         paidAmountUsd:
 *           type: number
 *           default: 0
 *           example: 0
 *         usdToUzsRate:
 *           type: number
 *           description: Required when paidAmountUsd > 0
 *           example: 12700
 *         paymentMethod:
 *           $ref: '#/components/schemas/PaymentMethod'
 *         note:
 *           type: string
 *     AddPaymentRequest:
 *       type: object
 *       required: [paymentMethod]
 *       properties:
 *         amountUzs:
 *           type: number
 *           default: 0
 *           example: 100000
 *         amountUsd:
 *           type: number
 *           default: 0
 *         usdToUzsRate:
 *           type: number
 *         paymentMethod:
 *           $ref: '#/components/schemas/PaymentMethod'
 *         note:
 *           type: string
 *     SaleResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         saleType:
 *           $ref: '#/components/schemas/SaleType'
 *         totalAmountUzs:
 *           type: string
 *           example: "250000.00"
 *         paidAmountUzs:
 *           type: string
 *           example: "200000.00"
 *         debtAmountUzs:
 *           type: string
 *           example: "50000.00"
 *         branch:
 *           type: object
 *         customer:
 *           type: object
 *           nullable: true
 *         soldBy:
 *           type: object
 *         items:
 *           type: array
 *         payments:
 *           type: array
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /sales:
 *   post:
 *     summary: Create a sale (deducts inventory + updates customer debt atomically)
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSaleRequest'
 *     responses:
 *       201:
 *         description: Sale recorded with inventory deducted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaleResponse'
 *       400:
 *         description: Debt requires a customer
 *       404:
 *         description: Product, branch or customer not found
 *       409:
 *         description: Insufficient stock or inactive product
 *       422:
 *         description: Validation error
 */
router.post("/", validate(createSaleSchema), SalesController.create);

/**
 * @swagger
 * /sales:
 *   get:
 *     summary: List sales with filters (branch-scoped for ADMIN)
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: saleType
 *         schema:
 *           $ref: '#/components/schemas/SaleType'
 *       - in: query
 *         name: hasDebt
 *         schema:
 *           type: boolean
 *         description: Filter sales with outstanding debt
 *       - in: query
 *         name: overdue
 *         schema:
 *           type: boolean
 *         description: Filter sales where debtDueDate has passed and debt remains
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Sale list (without items/payments for performance)
 */
router.get("/", SalesController.findAll);

/**
 * @swagger
 * /sales/payments:
 *   get:
 *     summary: List debt repayment transactions
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: customerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: paymentMethod
 *         schema: { $ref: '#/components/schemas/PaymentMethod' }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated debt repayment list
 */
router.get("/payments", SalesController.findDebtPayments);

/**
 * @swagger
 * /sales/{id}:
 *   get:
 *     summary: Get full sale detail including all items and payments
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full sale detail
 *       403:
 *         description: Sale belongs to another branch
 *       404:
 *         description: Sale not found
 */
router.get("/:id", SalesController.findById);

/**
 * @swagger
 * /sales/{id}/payments:
 *   post:
 *     summary: Record an additional payment against an existing sale (debt repayment)
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddPaymentRequest'
 *     responses:
 *       200:
 *         description: Payment recorded, debt updated
 *       400:
 *         description: No outstanding debt on this sale
 *       404:
 *         description: Sale not found
 *       422:
 *         description: Validation error
 */
router.post("/:id/payments", validate(addPaymentSchema), SalesController.addPayment);

/**
 * @swagger
 * /sales/{id}/debt-deadline:
 *   patch:
 *     summary: Set or clear the repayment deadline on a credit sale
 *     description: |
 *       Sets `debtDueDate` on a sale that has outstanding debt. Pass `null` to remove
 *       an existing deadline. Once the deadline passes and debt remains, the sale
 *       appears in `GET /sales?overdue=true` and the analytics overdue summary.
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [debtDueDate]
 *             properties:
 *               debtDueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 example: "2025-06-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Deadline updated
 *       400:
 *         description: Sale has no outstanding debt
 *       403:
 *         description: Sale belongs to another branch
 *       404:
 *         description: Sale not found
 *       422:
 *         description: Validation error
 */
router.patch("/:id/debt-deadline", validate(setDebtDeadlineSchema), SalesController.setDebtDeadline);

export default router;
