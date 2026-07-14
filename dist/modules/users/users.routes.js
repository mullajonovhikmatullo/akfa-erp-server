"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const users_controller_1 = require("./controllers/users.controller");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const role_middleware_1 = require("../auth/middleware/role.middleware");
const router = (0, express_1.Router)();
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
router.get("/me", auth_middleware_1.authMiddleware, users_controller_1.UsersController.me);
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
router.get("/super-admin", auth_middleware_1.authMiddleware, (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), users_controller_1.UsersController.superAdminData);
exports.default = router;
