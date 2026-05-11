import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { requireRole } from "../../core/middleware/requireRole";
import { validate } from "../../core/middleware/validate";
import { createTransferSchema } from "./validations/transfer.validation";
import { TransfersController } from "./controllers/transfers.controller";

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * components:
 *   schemas:
 *     TransferStatus:
 *       type: string
 *       enum: [PENDING, COMPLETED, CANCELLED]
 *     TransferItem:
 *       type: object
 *       properties:
 *         productId:
 *           type: string
 *           format: uuid
 *         quantity:
 *           type: number
 *           example: 10
 *         unitCostUzs:
 *           type: number
 *           example: 85000
 *           description: Defaults to product wholesale price if omitted
 *     CreateTransferRequest:
 *       type: object
 *       required: [toBranchId, items]
 *       properties:
 *         fromBranchId:
 *           type: string
 *           format: uuid
 *           description: Required for SUPER_ADMIN; ignored for ADMIN (uses their branch)
 *         toBranchId:
 *           type: string
 *           format: uuid
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/TransferItem'
 *         note:
 *           type: string
 *           maxLength: 500
 */

/**
 * @swagger
 * /transfers:
 *   post:
 *     summary: Create a pending stock transfer between branches
 *     tags: [Transfers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTransferRequest'
 *     responses:
 *       201:
 *         description: Transfer created in PENDING status
 *       400:
 *         description: Same source/destination or missing branchId
 *       404:
 *         description: Branch or product not found
 *       422:
 *         description: Validation error
 */
router.post("/", validate(createTransferSchema), TransfersController.create);

/**
 * @swagger
 * /transfers:
 *   get:
 *     summary: List transfers (branch-scoped for ADMIN)
 *     tags: [Transfers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SUPER_ADMIN only — filter by branch (as source or destination)
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/TransferStatus'
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
 *         description: Transfer list
 */
router.get("/", TransfersController.findAll);

/**
 * @swagger
 * /transfers/{id}:
 *   get:
 *     summary: Get a single transfer
 *     tags: [Transfers]
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
 *         description: Transfer detail
 *       403:
 *         description: Transfer does not involve your branch
 *       404:
 *         description: Not found
 */
router.get("/:id", TransfersController.findById);

/**
 * @swagger
 * /transfers/{id}/complete:
 *   post:
 *     summary: Complete a transfer — moves stock atomically (SUPER_ADMIN only)
 *     description: |
 *       Deducts stock from the source branch (FIFO, logged as TRANSFER_OUT) and
 *       adds it to the destination branch (new batch at transfer cost, logged as TRANSFER_IN).
 *       Not counted in sales figures.
 *     tags: [Transfers]
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
 *         description: Transfer completed and stock moved
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Transfer not found
 *       409:
 *         description: Transfer is not in PENDING status
 */
router.post("/:id/complete", requireRole("SUPER_ADMIN"), TransfersController.complete);

/**
 * @swagger
 * /transfers/{id}/cancel:
 *   post:
 *     summary: Cancel a pending transfer (no stock movement)
 *     description: ADMIN can cancel only their own transfers; SUPER_ADMIN can cancel any.
 *     tags: [Transfers]
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
 *         description: Transfer cancelled
 *       403:
 *         description: Cannot cancel another admin's transfer
 *       404:
 *         description: Transfer not found
 *       409:
 *         description: Transfer is not in PENDING status
 */
router.post("/:id/cancel", TransfersController.cancel);

export default router;
