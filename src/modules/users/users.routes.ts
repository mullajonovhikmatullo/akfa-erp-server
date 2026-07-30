import { Router } from "express";

import { UsersController } from "./controllers/users.controller";

import { authMiddleware } from "../auth/middleware/auth.middleware";

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

export default router;
