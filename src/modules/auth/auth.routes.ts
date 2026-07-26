import { Router } from "express";
import { AuthController } from "./controllers/auth.controller";
import { authMiddleware } from "./middleware/auth.middleware";
import { validate } from "../../core/middleware/validate";
import { handoffRateLimit, loginRateLimit } from "../../core/middleware/rateLimit";
import {
    completeAccountSetupSchema,
    exchangeHandoffSchema,
    loginSchema,
} from "./validations/auth.validation";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           example: admin
 *         password:
 *           type: string
 *           example: secret123
 *     LoginResponse:
 *       type: object
 *       required:
 *         - accessToken
 *         - user
 *       properties:
 *         accessToken:
 *           type: string
 *         user:
 *           type: object
 *           required:
 *             - id
 *             - name
 *             - username
 *             - role
 *             - rawRole
 *             - storeId
 *             - branchId
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             username:
 *               type: string
 *             role:
 *               type: string
 *             rawRole:
 *               type: string
 *             storeId:
 *               type: string
 *               nullable: true
 *             branchId:
 *               type: string
 *               nullable: true
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", loginRateLimit, validate(loginSchema), AuthController.login);
router.post(
    "/handoff/exchange",
    handoffRateLimit,
    validate(exchangeHandoffSchema),
    AuthController.exchangeHandoff
);
router.post(
    "/setup/complete",
    handoffRateLimit,
    validate(completeAccountSetupSchema),
    AuthController.completeAccountSetup
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authMiddleware, AuthController.me);

router.patch("/profile", authMiddleware, AuthController.updateProfile);

router.post("/change-password", authMiddleware, AuthController.changePassword);

export default router;
