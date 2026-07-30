import { Router } from "express";

import { BranchesController } from "./controllers/branches.controller";

import { authMiddleware } from "../auth/middleware/auth.middleware";

import { roleMiddleware } from "../auth/middleware/role.middleware";

import { validate } from "../../core/middleware/validate";

import {
    createBranchSchema,
    updateBranchSchema,
} from "./validations/branch.validation";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateBranchDto:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           example: Main Branch
 *         address:
 *           type: string
 *           example: 123 Main St
 *         phone:
 *           type: string
 *           example: +998901234567
 */

/**
 * @swagger
 * /branches:
 *   post:
 *     summary: Create branch
 *     tags:
 *       - Branches
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBranchDto'
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       500:
 *         description: Failed to create branch
 */
router.post(
    "/",

    authMiddleware,

    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),

    validate(createBranchSchema),

    BranchesController.create
);

/**
 * @swagger
 * /branches:
 *   get:
 *     summary: Get all branches
 *     tags:
 *       - Branches
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of branches
 */
router.get(
    "/",

    authMiddleware,

    BranchesController.findAll
);

/**
 * @swagger
 * /branches/{id}:
 *   patch:
 *     summary: Update branch
 *     tags:
 *       - Branches
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch updated
 */
router.patch(
    "/:id",
    authMiddleware,
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(updateBranchSchema),
    BranchesController.update
);

/**
 * @swagger
 * /branches/{id}:
 *   delete:
 *     summary: Delete branch
 *     tags:
 *       - Branches
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch deleted
 *       500:
 *         description: Delete failed
 */
router.delete(
    "/:id",

    authMiddleware,

    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),

    BranchesController.delete
);

export default router;
