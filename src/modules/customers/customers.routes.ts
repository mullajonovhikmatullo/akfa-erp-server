import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate";
import { createCustomerSchema, updateCustomerSchema } from "./validations/customer.validation";
import { CustomersController } from "./controllers/customers.controller";

const router = Router();

router.use(authMiddleware);

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
router.post("/", validate(createCustomerSchema), CustomersController.create);

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
router.get("/", CustomersController.findAll);

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
router.get("/:id", CustomersController.findById);

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
router.patch("/:id", validate(updateCustomerSchema), CustomersController.update);

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
router.delete("/:id", CustomersController.delete);

export default router;
