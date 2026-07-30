import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { roleMiddleware } from "../auth/middleware/role.middleware";
import { validate } from "../../core/middleware/validate";
import { createAdminSchema, updateAdminSchema } from "./validations/admin.validation";
import { AdminsController } from "./controllers/admins.controller";

const router = Router();

router.use(authMiddleware, roleMiddleware("STORE_OWNER", "STORE_ADMIN"));

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
 *           minLength: 10
 *           example: secret12345
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
router.post(
    "/",
    roleMiddleware("STORE_OWNER"),
    validate(createAdminSchema),
    AdminsController.create
);

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
router.get("/", AdminsController.findAll);

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
router.get("/:id", AdminsController.findById);

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
router.patch(
    "/:id",
    roleMiddleware("STORE_OWNER"),
    validate(updateAdminSchema),
    AdminsController.update
);

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
router.patch(
    "/:id/disable",
    roleMiddleware("STORE_OWNER"),
    AdminsController.disable
);

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
router.patch(
    "/:id/enable",
    roleMiddleware("STORE_OWNER"),
    AdminsController.enable
);

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
router.delete(
    "/:id",
    roleMiddleware("STORE_OWNER"),
    AdminsController.delete
);

export default router;
