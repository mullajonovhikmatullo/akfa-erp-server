"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateLimit_1 = require("../../core/middleware/rateLimit");
const validate_1 = require("../../core/middleware/validate");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const exchange_rates_controller_1 = require("./controllers/exchange-rates.controller");
const exchange_rate_validation_1 = require("./validations/exchange-rate.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
/**
 * @swagger
 * components:
 *   schemas:
 *     ExchangeRateMode:
 *       type: string
 *       enum: [CBU, MANUAL]
 *     ExchangeRate:
 *       type: object
 *       required: [mode, usdToUzsRate, manualRate, cbu, changedAt, changedBy]
 *       properties:
 *         mode:
 *           $ref: '#/components/schemas/ExchangeRateMode'
 *         usdToUzsRate:
 *           type: number
 *           nullable: true
 *           description: The rate the store uses now. Null only before the first Central Bank fetch.
 *           example: 11846.57
 *         manualRate:
 *           type: number
 *           nullable: true
 *         cbu:
 *           type: object
 *           nullable: true
 *           required: [rate, rateDate, fetchedAt]
 *           properties:
 *             rate:
 *               type: number
 *             rateDate:
 *               type: string
 *               format: date
 *             fetchedAt:
 *               type: string
 *               format: date-time
 *         changedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         changedBy:
 *           type: object
 *           nullable: true
 *           required: [id, fullName]
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *     UpdateExchangeRateRequest:
 *       type: object
 *       required: [mode, ownerPassword]
 *       properties:
 *         mode:
 *           $ref: '#/components/schemas/ExchangeRateMode'
 *         rate:
 *           type: number
 *           description: Required when mode is MANUAL.
 *           example: 12000
 *         ownerPassword:
 *           type: string
 *           description: Password of the store owner account.
 */
/**
 * @swagger
 * /exchange-rate:
 *   get:
 *     summary: Current USD→UZS rate of the store (Central Bank by default)
 *     tags: [ExchangeRate]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current rate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExchangeRate'
 *   put:
 *     summary: Switch to the Central Bank rate or set a manual rate (requires the store owner password)
 *     tags: [ExchangeRate]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateExchangeRateRequest'
 *     responses:
 *       200:
 *         description: Updated rate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExchangeRate'
 *       403:
 *         description: Store owner password is incorrect
 */
router.get("/", exchange_rates_controller_1.ExchangeRatesController.getCurrent);
router.put("/", rateLimit_1.sensitiveActionRateLimit, (0, validate_1.validate)(exchange_rate_validation_1.updateExchangeRateSchema), exchange_rates_controller_1.ExchangeRatesController.update);
exports.default = router;
