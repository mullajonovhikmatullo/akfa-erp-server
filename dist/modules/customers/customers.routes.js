"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const validate_1 = require("../../core/middleware/validate");
const customer_validation_1 = require("./validations/customer.validation");
const customers_controller_1 = require("./controllers/customers.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
/**
 * @swagger
 * components:
 *   schemas:
 *     CustomerResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         fullName:
 *           type: string
 *         phone:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *         balance:
 *           type: string
 *           description: "Positive = owes us (debt); Negative = we owe them (credit)"
 *           example: "50000.00"
 *         isActive:
 *           type: boolean
 *         branch:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *     CreateCustomerRequest:
 *       type: object
 *       required: [fullName]
 *       properties:
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Required for SUPER_ADMIN; ignored for ADMIN
 *         fullName:
 *           type: string
 *           example: Bobur Toshmatov
 *         phone:
 *           type: string
 *           example: "+998901234567"
 *         address:
 *           type: string
 *           example: "Tashkent, Chilanzar 5"
 *         balance:
 *           type: number
 *           example: 50000
 *     UpdateCustomerRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *         isActive:
 *           type: boolean
 */
/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Register a new customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCustomerRequest'
 *     responses:
 *       201:
 *         description: Customer created
 *       422:
 *         description: Validation error
 */
router.post("/", (0, validate_1.validate)(customer_validation_1.createCustomerSchema), customers_controller_1.CustomersController.create);
/**
 * @swagger
 * /customers:
 *   get:
 *     summary: List customers (branch-scoped for ADMIN)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or phone
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: hasDebt
 *         schema:
 *           type: boolean
 *         description: Filter customers with outstanding debt
 *     responses:
 *       200:
 *         description: Customer list
 */
router.get("/", customers_controller_1.CustomersController.findAll);
/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get customer detail with recent sales
 *     tags: [Customers]
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
 *         description: Customer detail with last 10 sales
 *       403:
 *         description: Forbidden — customer belongs to another branch
 *       404:
 *         description: Customer not found
 */
router.get("/:id", customers_controller_1.CustomersController.findById);
/**
 * @swagger
 * /customers/{id}:
 *   patch:
 *     summary: Update customer info
 *     tags: [Customers]
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
 *             $ref: '#/components/schemas/UpdateCustomerRequest'
 *     responses:
 *       200:
 *         description: Customer updated
 */
router.patch("/:id", (0, validate_1.validate)(customer_validation_1.updateCustomerSchema), customers_controller_1.CustomersController.update);
/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Deactivate a customer (blocked if outstanding debt exists)
 *     tags: [Customers]
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
 *         description: Customer deactivated
 *       409:
 *         description: Customer has outstanding debt
 */
router.delete("/:id", customers_controller_1.CustomersController.delete);
exports.default = router;
