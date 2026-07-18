"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const role_middleware_1 = require("../auth/middleware/role.middleware");
const validate_1 = require("../../core/middleware/validate");
const product_validation_1 = require("./validations/product.validation");
const category_validation_1 = require("./validations/category.validation");
const products_controller_1 = require("./controllers/products.controller");
const categories_controller_1 = require("./controllers/categories.controller");
const router = (0, express_1.Router)();
// All product/category routes require authentication
router.use(auth_middleware_1.authMiddleware);
// ─── Category Routes ───────────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     CategoryResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         isActive:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *     CreateCategoryRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           example: Glass Panels
 *         description:
 *           type: string
 *           example: All types of flat glass products
 *     UpdateCategoryRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         isActive:
 *           type: boolean
 */
/**
 * @swagger
 * /products/categories:
 *   post:
 *     summary: Create a product category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryRequest'
 *     responses:
 *       201:
 *         description: Category created
 *       409:
 *         description: Category name already exists
 *       422:
 *         description: Validation error
 */
router.post("/categories", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), (0, validate_1.validate)(category_validation_1.createCategorySchema), categories_controller_1.CategoriesController.create);
/**
 * @swagger
 * /products/categories:
 *   get:
 *     summary: List all categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get("/categories", categories_controller_1.CategoriesController.findAll);
router.get("/categories/summary", categories_controller_1.CategoriesController.summary);
/**
 * @swagger
 * /products/categories/{id}:
 *   get:
 *     summary: Get a category by ID
 *     tags: [Categories]
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
 *         description: Category found
 *       404:
 *         description: Category not found
 */
router.get("/categories/:id", categories_controller_1.CategoriesController.findById);
/**
 * @swagger
 * /products/categories/{id}:
 *   patch:
 *     summary: Update a category
 *     tags: [Categories]
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
 *             $ref: '#/components/schemas/UpdateCategoryRequest'
 *     responses:
 *       200:
 *         description: Category updated
 *       404:
 *         description: Category not found
 *       409:
 *         description: Name already in use
 */
router.patch("/categories/:id", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), (0, validate_1.validate)(category_validation_1.updateCategorySchema), categories_controller_1.CategoriesController.update);
/**
 * @swagger
 * /products/categories/{id}:
 *   delete:
 *     summary: Delete a category (only if no products assigned)
 *     tags: [Categories]
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
 *         description: Category deleted
 *       409:
 *         description: Category has assigned products
 */
router.delete("/categories/:id", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), categories_controller_1.CategoriesController.delete);
// ─── Product Routes ────────────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     ProductUnit:
 *       type: string
 *       enum: [KG, PIECE]
 *     ProductResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         sku:
 *           type: string
 *           nullable: true
 *         unit:
 *           $ref: '#/components/schemas/ProductUnit'
 *         costPriceUzs:
 *           type: string
 *           description: Decimal value as string
 *           example: "180000.00"
 *         retailPriceUzs:
 *           type: string
 *           description: Decimal value as string
 *           example: "250000.00"
 *         wholesalePriceUzs:
 *           type: string
 *           example: "200000.00"
 *         costPriceUsd:
 *           type: string
 *           nullable: true
 *           example: "14.0000"
 *         retailPriceUsd:
 *           type: string
 *           nullable: true
 *           example: "19.9900"
 *         wholesalePriceUsd:
 *           type: string
 *           nullable: true
 *           example: "16.5000"
 *         isActive:
 *           type: boolean
 *         category:
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
 *     CreateProductRequest:
 *       type: object
 *       required: [name, unit, costPriceUzs, retailPriceUzs, wholesalePriceUzs]
 *       properties:
 *         name:
 *           type: string
 *           example: Float Glass 4mm
 *         description:
 *           type: string
 *           example: Clear float glass, thickness 4mm
 *         sku:
 *           type: string
 *           example: FG-4MM-CLR
 *         unit:
 *           $ref: '#/components/schemas/ProductUnit'
 *         categoryId:
 *           type: string
 *           format: uuid
 *         branchId:
 *           type: string
 *           format: uuid
 *           description: Branch where an initial zero-balance inventory row is created
 *         costPriceUzs:
 *           type: number
 *           example: 180000
 *         retailPriceUzs:
 *           type: number
 *           example: 250000
 *         wholesalePriceUzs:
 *           type: number
 *           example: 200000
 *         costPriceUsd:
 *           type: number
 *           example: 14.00
 *         retailPriceUsd:
 *           type: number
 *           example: 19.99
 *         wholesalePriceUsd:
 *           type: number
 *           example: 16.50
 *     UpdateProductRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         sku:
 *           type: string
 *         unit:
 *           $ref: '#/components/schemas/ProductUnit'
 *         categoryId:
 *           type: string
 *           format: uuid
 *         costPriceUzs:
 *           type: number
 *         retailPriceUzs:
 *           type: number
 *         wholesalePriceUzs:
 *           type: number
 *         costPriceUsd:
 *           type: number
 *         retailPriceUsd:
 *           type: number
 *         wholesalePriceUsd:
 *           type: number
 *         isActive:
 *           type: boolean
 */
/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductRequest'
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       404:
 *         description: Category not found
 *       409:
 *         description: SKU already in use
 *       422:
 *         description: Validation error
 */
router.post("/", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), (0, validate_1.validate)(product_validation_1.createProductSchema), products_controller_1.ProductsController.create);
/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products with optional filters
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, SKU, or description
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: unit
 *         schema:
 *           $ref: '#/components/schemas/ProductUnit'
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", products_controller_1.ProductsController.findAll);
router.get("/summary", products_controller_1.ProductsController.summary);
/**
 * @swagger
 * /products/sku/{sku}:
 *   get:
 *     summary: Lookup a product by SKU (barcode scan)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         example: FG-4MM-CLR
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: No product with that SKU
 */
router.get("/sku/:sku", products_controller_1.ProductsController.findBySku);
/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Products]
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
 *         description: Product found
 *       404:
 *         description: Product not found
 */
router.get("/:id", products_controller_1.ProductsController.findById);
/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update a product
 *     tags: [Products]
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
 *             $ref: '#/components/schemas/UpdateProductRequest'
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product or category not found
 *       409:
 *         description: SKU already in use
 */
router.patch("/:id", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), (0, validate_1.validate)(product_validation_1.updateProductSchema), products_controller_1.ProductsController.update);
/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
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
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id", (0, role_middleware_1.roleMiddleware)("SUPER_ADMIN"), products_controller_1.ProductsController.delete);
exports.default = router;
