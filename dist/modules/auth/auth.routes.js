"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./controllers/auth.controller");
const auth_middleware_1 = require("./middleware/auth.middleware");
const validate_1 = require("../../core/middleware/validate");
const rateLimit_1 = require("../../core/middleware/rateLimit");
const auth_validation_1 = require("./validations/auth.validation");
const router = (0, express_1.Router)();
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
 *             base64Photo:
 *               type: string
 *               nullable: true
 *               description: Clear WebP profile photo as a data URL
 *             thumbnailPhoto:
 *               type: string
 *               nullable: true
 *               description: 96x96 WebP profile thumbnail as a data URL
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
router.post("/login", rateLimit_1.loginRateLimit, (0, validate_1.validate)(auth_validation_1.loginSchema), auth_controller_1.AuthController.login);
router.post("/handoff/exchange", rateLimit_1.handoffRateLimit, (0, validate_1.validate)(auth_validation_1.exchangeHandoffSchema), auth_controller_1.AuthController.exchangeHandoff);
router.post("/setup/complete", rateLimit_1.handoffRateLimit, (0, validate_1.validate)(auth_validation_1.completeAccountSetupSchema), auth_controller_1.AuthController.completeAccountSetup);
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
router.get("/me", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.me);
router.patch("/profile", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.updateProfile);
/**
 * @openapi
 * /auth/profile/photo:
 *   put:
 *     tags: [Auth]
 *     summary: Upload or replace the current user's profile photo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [base64Photo]
 *             properties:
 *               base64Photo:
 *                 type: string
 *                 description: JPEG, PNG or WebP data URL, maximum 5 MB decoded
 *     responses:
 *       200:
 *         description: Updated current user with clear and thumbnail profile photos
 *       422:
 *         description: Unsupported or invalid image
 *   delete:
 *     tags: [Auth]
 *     summary: Remove the current user's profile photo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Updated current user with cleared profile photos
 */
router.put("/profile/photo", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.updateProfilePhoto);
router.delete("/profile/photo", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.deleteProfilePhoto);
router.post("/change-password", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.changePassword);
exports.default = router;
