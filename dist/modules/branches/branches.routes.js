"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const branches_controller_1 = require("./controllers/branches.controller");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const role_middleware_1 = require("../auth/middleware/role.middleware");
const validate_1 = require("../../core/middleware/validate");
const branch_validation_1 = require("./validations/branch.validation");
const router = (0, express_1.Router)();
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
router.post("/", auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(branch_validation_1.createBranchSchema), branches_controller_1.BranchesController.create);
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
router.get("/", auth_middleware_1.authMiddleware, branches_controller_1.BranchesController.findAll);
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
router.patch("/:id", auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(branch_validation_1.updateBranchSchema), branches_controller_1.BranchesController.update);
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
router.delete("/:id", auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), branches_controller_1.BranchesController.delete);
exports.default = router;
