"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const role_middleware_1 = require("../auth/middleware/role.middleware");
const validate_1 = require("../../core/middleware/validate");
const admin_validation_1 = require("./validations/admin.validation");
const admins_controller_1 = require("./controllers/admins.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN"));
/**
 * @swagger
 * components:
 *   schemas:
 *     AdminResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         fullName:
 *           type: string
 *         username:
 *           type: string
 *         role:
 *           type: string
 *           example: ADMIN
 *         isActive:
 *           type: boolean
 *         branchId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         branch:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateAdminRequest:
 *       type: object
 *       required: [fullName, username, password, branchId]
 *       properties:
 *         fullName:
 *           type: string
 *           example: John Doe
 *         username:
 *           type: string
 *           example: john_admin
 *         password:
 *           type: string
 *           minLength: 6
 *           example: secret123
 *         branchId:
 *           type: string
 *           format: uuid
 *     UpdateAdminRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *         branchId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         isActive:
 *           type: boolean
 */
/**
 * @swagger
 * /admins:
 *   post:
 *     summary: Create a new admin and assign to a branch
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAdminRequest'
 *     responses:
 *       201:
 *         description: Admin created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminResponse'
 *       409:
 *         description: Username already taken
 *       404:
 *         description: Branch not found
 *       422:
 *         description: Validation error
 */
router.post("/", (0, validate_1.validate)(admin_validation_1.createAdminSchema), admins_controller_1.AdminsController.create);
/**
 * @swagger
 * /admins:
 *   get:
 *     summary: List all admins (filterable by branch and status)
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of admins
 */
router.get("/", admins_controller_1.AdminsController.findAll);
/**
 * @swagger
 * /admins/{id}:
 *   get:
 *     summary: Get a single admin by ID
 *     tags: [Admins]
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
 *         description: Admin found
 *       404:
 *         description: Admin not found
 */
router.get("/:id", admins_controller_1.AdminsController.findById);
/**
 * @swagger
 * /admins/{id}:
 *   patch:
 *     summary: Update admin details or reassign to another branch
 *     tags: [Admins]
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
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateAdminRequest'
 *     responses:
 *       200:
 *         description: Admin updated
 *       404:
 *         description: Admin or branch not found
 */
router.patch("/:id", (0, validate_1.validate)(admin_validation_1.updateAdminSchema), admins_controller_1.AdminsController.update);
/**
 * @swagger
 * /admins/{id}/disable:
 *   patch:
 *     summary: Disable an admin account
 *     tags: [Admins]
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
 *         description: Admin disabled
 */
router.patch("/:id/disable", admins_controller_1.AdminsController.disable);
/**
 * @swagger
 * /admins/{id}/enable:
 *   patch:
 *     summary: Re-enable a disabled admin account
 *     tags: [Admins]
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
 *         description: Admin enabled
 */
router.patch("/:id/enable", admins_controller_1.AdminsController.enable);
/**
 * @swagger
 * /admins/{id}:
 *   delete:
 *     summary: Permanently delete an admin
 *     tags: [Admins]
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
 *       204:
 *         description: Admin deleted
 *       404:
 *         description: Admin not found
 */
router.delete("/:id", admins_controller_1.AdminsController.delete);
exports.default = router;
