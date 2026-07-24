"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const requireRole_1 = require("../../core/middleware/requireRole");
const validate_1 = require("../../core/middleware/validate");
const expense_validation_1 = require("./validations/expense.validation");
const expense_category_validation_1 = require("./validations/expense-category.validation");
const expenses_controller_1 = require("./controllers/expenses.controller");
const expense_categories_controller_1 = require("./controllers/expense-categories.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
// ─── Expense Category CRUD ────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     ExpenseCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           example: "Rent"
 *         description:
 *           type: string
 *           nullable: true
 *         isActive:
 *           type: boolean
 *         _count:
 *           type: object
 *           properties:
 *             expenses:
 *               type: integer
 *     CreateExpenseCategoryRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           example: "Rent"
 *         description:
 *           type: string
 *     UpdateExpenseCategoryRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         isActive:
 *           type: boolean
 */
/**
 * @swagger
 * /expenses/categories:
 *   post:
 *     summary: Create an expense category (SUPER_ADMIN only)
 *     tags: [Expense Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseCategoryRequest'
 *     responses:
 *       201:
 *         description: Category created
 *       409:
 *         description: Name already exists
 *       422:
 *         description: Validation error
 */
router.post("/categories", (0, requireRole_1.requireRole)("STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN"), (0, validate_1.validate)(expense_category_validation_1.createExpenseCategorySchema), expense_categories_controller_1.ExpenseCategoriesController.create);
/**
 * @swagger
 * /expenses/categories:
 *   get:
 *     summary: List expense categories
 *     tags: [Expense Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive categories (SUPER_ADMIN use)
 *     responses:
 *       200:
 *         description: Category list with linked expense count
 */
router.get("/categories", expense_categories_controller_1.ExpenseCategoriesController.findAll);
/**
 * @swagger
 * /expenses/categories/{id}:
 *   get:
 *     summary: Get a single expense category
 *     tags: [Expense Categories]
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
 *         description: Category detail
 *       404:
 *         description: Not found
 */
router.get("/categories/:id", expense_categories_controller_1.ExpenseCategoriesController.findById);
/**
 * @swagger
 * /expenses/categories/{id}:
 *   patch:
 *     summary: Update an expense category (SUPER_ADMIN only)
 *     tags: [Expense Categories]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateExpenseCategoryRequest'
 *     responses:
 *       200:
 *         description: Category updated
 *       404:
 *         description: Not found
 *       409:
 *         description: Name conflict
 */
router.patch("/categories/:id", (0, requireRole_1.requireRole)("STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN"), (0, validate_1.validate)(expense_category_validation_1.updateExpenseCategorySchema), expense_categories_controller_1.ExpenseCategoriesController.update);
/**
 * @swagger
 * /expenses/categories/{id}:
 *   delete:
 *     summary: Delete an expense category (SUPER_ADMIN only, only if no linked expenses)
 *     tags: [Expense Categories]
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
 *         description: Deleted
 *       409:
 *         description: Category has linked expenses — deactivate it instead
 */
router.delete("/categories/:id", (0, requireRole_1.requireRole)("STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN"), expense_categories_controller_1.ExpenseCategoriesController.delete);
// ─── Expenses CRUD ────────────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     CreateExpenseRequest:
 *       type: object
 *       required: [categoryId, amount]
 *       properties:
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Ignored on create; expense is recorded for authenticated user's branch
 *         categoryId:
 *           type: string
 *           format: uuid
 *           description: ID of an active ExpenseCategory
 *         amount:
 *           type: number
 *           example: 3500000
 *           description: Amount in UZS equivalent
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           default: UZS
 *         amountUsd:
 *           type: number
 *           example: 275
 *           description: Original USD amount when currency is USD
 *         usdToUzsRate:
 *           type: number
 *           example: 12650
 *           description: Required when currency is USD
 *         description:
 *           type: string
 *           example: "Monthly rent payment"
 *         expenseDate:
 *           type: string
 *           format: date-time
 *           description: Defaults to now if omitted
 */
/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Record a branch expense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseRequest'
 *     responses:
 *       201:
 *         description: Expense recorded
 *       404:
 *         description: Expense category not found
 *       409:
 *         description: Category is inactive
 *       422:
 *         description: Validation error
 */
router.post("/", (0, validate_1.validate)(expense_validation_1.createExpenseSchema), expenses_controller_1.ExpensesController.create);
/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: List expenses (branch-scoped for ADMIN)
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Expense list
 */
router.get("/", expenses_controller_1.ExpensesController.findAll);
/**
 * @swagger
 * /expenses/summary/categories:
 *   get:
 *     summary: Expense category totals for KPI and breakdown
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: Maximum KPI cards. Overflow is grouped into the final item.
 *     responses:
 *       200:
 *         description: Category totals
 */
router.get("/summary/categories", expenses_controller_1.ExpensesController.categorySummary);
/**
 * @swagger
 * /expenses/{id}:
 *   get:
 *     summary: Get a single expense
 *     tags: [Expenses]
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
 *         description: Expense detail
 *       404:
 *         description: Not found
 */
router.get("/:id", expenses_controller_1.ExpensesController.findById);
/**
 * @swagger
 * /expenses/{id}:
 *   delete:
 *     summary: Delete an expense (ADMIN within 24h; SUPER_ADMIN anytime)
 *     tags: [Expenses]
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
 *         description: Deleted
 *       403:
 *         description: Too old to delete or wrong branch
 */
router.delete("/:id", expenses_controller_1.ExpensesController.delete);
exports.default = router;
