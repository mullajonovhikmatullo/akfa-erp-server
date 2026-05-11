import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate";
import { stockInSchema, adjustmentSchema } from "./validations/inventory.validation";
import { InventoryController } from "./controllers/inventory.controller";

const router = Router();

router.use(authMiddleware);

// ─── Stock In ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * components:
 *   schemas:
 *     StockInRequest:
 *       type: object
 *       required: [productId, quantity, costPriceUzs]
 *       properties:
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Required for SUPER_ADMIN; ignored for ADMIN (uses own branch)
 *         productId:
 *           type: string
 *           format: uuid
 *         quantity:
 *           type: number
 *           example: 100
 *         costPriceUzs:
 *           type: number
 *           example: 180000
 *         costPriceUsd:
 *           type: number
 *           example: 14.50
 *         supplierNote:
 *           type: string
 *           example: "Delivery #2341 from Tashkent warehouse"
 *     AdjustmentRequest:
 *       type: object
 *       required: [productId, newQuantity, reason]
 *       properties:
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Required for SUPER_ADMIN; ignored for ADMIN
 *         productId:
 *           type: string
 *           format: uuid
 *         newQuantity:
 *           type: number
 *           example: 95
 *           description: Absolute new quantity (not a delta)
 *         reason:
 *           type: string
 *           example: "Physical count correction — 5 units damaged"
 *     InventoryRecord:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         quantity:
 *           type: string
 *           description: Decimal — current stock level
 *           example: "95.0000"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         branch:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         product:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             sku:
 *               type: string
 *             unit:
 *               type: string
 *             lowStockThreshold:
 *               type: string
 *               nullable: true
 *     StockMovement:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *           enum: [STOCK_IN, STOCK_OUT, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT]
 *         quantity:
 *           type: string
 *           description: Positive = in, negative = out
 *         balanceAfter:
 *           type: string
 *         note:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         product:
 *           type: object
 *         branch:
 *           type: object
 *         createdBy:
 *           type: object
 */

/**
 * @swagger
 * /inventory/stock-in:
 *   post:
 *     summary: Receive goods into branch inventory (creates batch + updates stock)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StockInRequest'
 *     responses:
 *       201:
 *         description: Stock received, batch created
 *       404:
 *         description: Branch or product not found
 *       409:
 *         description: Product is inactive
 *       422:
 *         description: Validation error
 */
router.post("/stock-in", validate(stockInSchema), InventoryController.stockIn);

// ─── Adjustment ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /inventory/adjustment:
 *   post:
 *     summary: Manual stock correction (physical count reconciliation)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdjustmentRequest'
 *     responses:
 *       200:
 *         description: Stock adjusted with delta and movement log
 *       400:
 *         description: New quantity equals current stock
 *       422:
 *         description: Validation error
 */
router.post("/adjustment", validate(adjustmentSchema), InventoryController.adjust);

// ─── Current Stock ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Current stock levels (branch-scoped for ADMIN)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SUPER_ADMIN only — omit to see all branches
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: lowStock
 *         schema:
 *           type: boolean
 *         description: Filter products at or below their lowStockThreshold
 *     responses:
 *       200:
 *         description: List of inventory records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryRecord'
 */
router.get("/", InventoryController.findAll);

// ─── Low Stock ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /inventory/low-stock:
 *   get:
 *     summary: Products at or below their low-stock threshold
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Low-stock inventory records
 */
router.get("/low-stock", (req, res, next) => {
    req.query.lowStock = "true";
    InventoryController.findAll(req, res, next);
});

// ─── Movement History ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /inventory/movements:
 *   get:
 *     summary: Full stock movement audit log
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [STOCK_IN, STOCK_OUT, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         example: "2025-01-01T00:00:00.000Z"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *     responses:
 *       200:
 *         description: Movement log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StockMovement'
 */
router.get("/movements", InventoryController.findMovements);

// ─── Batch History ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /inventory/batches:
 *   get:
 *     summary: View delivery batches (FIFO source — cost price per batch)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: depleted
 *         schema:
 *           type: boolean
 *         description: true = show fully consumed batches, false = active batches only
 *     responses:
 *       200:
 *         description: List of stock batches
 */
router.get("/batches", InventoryController.findBatches);

export default router;
