import { Router } from "express";

import { UsersController } from "./controllers/users.controller";

import { authMiddleware } from "../auth/middleware/auth.middleware";

import { roleMiddleware } from "../auth/middleware/role.middleware";

const router = Router();

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Current user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get(
    "/me",

    authMiddleware,

    UsersController.me
);

/**
 * @swagger
 * /users/super-admin:
 *   get:
 *     summary: Super admin only
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get(
    "/super-admin",

    authMiddleware,

    roleMiddleware("SUPER_ADMIN"),

    UsersController.superAdminData
);

export default router;