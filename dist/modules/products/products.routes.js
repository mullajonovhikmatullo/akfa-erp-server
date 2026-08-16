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
const product_images_controller_1 = require("./images/controllers/product-images.controller");
const product_image_upload_middleware_1 = require("./images/middleware/product-image-upload.middleware");
const product_image_validation_1 = require("./images/validations/product-image.validation");
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
router.post("/categories", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(category_validation_1.createCategorySchema), categories_controller_1.CategoriesController.create);
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
router.patch("/categories/:id", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(category_validation_1.updateCategorySchema), categories_controller_1.CategoriesController.update);
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
router.delete("/categories/:id", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), categories_controller_1.CategoriesController.delete);
// ─── Product Routes ────────────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     ProductUnit:
 *       type: string
 *       enum: [KG, PIECE]
 *     ProductImageResponse:
 *       type: object
 *       required:
 *         - id
 *         - productId
 *         - url
 *         - thumbnailUrl
 *         - originalFilename
 *         - mimeType
 *         - fileSize
 *         - width
 *         - height
 *         - isPrimary
 *         - sortOrder
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         productId:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *           format: uri
 *         thumbnailUrl:
 *           type: string
 *           format: uri
 *         originalFilename:
 *           type: string
 *         mimeType:
 *           type: string
 *           enum: [image/webp]
 *         fileSize:
 *           type: integer
 *         width:
 *           type: integer
 *         height:
 *           type: integer
 *         isPrimary:
 *           type: boolean
 *         sortOrder:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ReorderProductImagesRequest:
 *       type: object
 *       required: [imageIds]
 *       properties:
 *         imageIds:
 *           type: array
 *           minItems: 1
 *           maxItems: 5
 *           uniqueItems: true
 *           items:
 *             type: string
 *             format: uuid
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
 *         lowStockThreshold:
 *           type: string
 *           nullable: true
 *           description: Product-specific quantity at or below which the product is considered low stock
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
 *         primaryImageUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *         primaryThumbnailUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *         imageCount:
 *           type: integer
 *         images:
 *           type: array
 *           description: Present on product detail responses.
 *           items:
 *             $ref: '#/components/schemas/ProductImageResponse'
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
 *         lowStockThreshold:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *           description: Product-specific quantity at or below which the product is considered low stock
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
 *         lowStockThreshold:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *           description: Product-specific quantity at or below which the product is considered low stock
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
router.post("/", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(product_validation_1.createProductSchema), products_controller_1.ProductsController.create);
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
 * /products/{productId}/images:
 *   post:
 *     summary: Upload up to five optimized product images
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Images uploaded
 *       413:
 *         description: Image exceeds 5 MB
 *       422:
 *         description: Invalid image or product image limit exceeded
 *   get:
 *     summary: List product images
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ordered product images
 */
router.post("/:productId/images", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), product_image_upload_middleware_1.productImageUpload, product_images_controller_1.ProductImagesController.upload);
router.get("/:productId/images", product_images_controller_1.ProductImagesController.list);
/**
 * @swagger
 * /products/{productId}/images/{imageId}:
 *   put:
 *     summary: Replace a product image while preserving its order and primary state
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 1
 *                 items:
 *                   type: string
 *                   format: binary
 *   delete:
 *     summary: Delete a product image and select a new primary when needed
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:productId/images/:imageId", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), product_image_upload_middleware_1.productImageUpload, product_images_controller_1.ProductImagesController.replace);
/**
 * @swagger
 * /products/{productId}/images/reorder:
 *   patch:
 *     summary: Replace the complete product image order
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReorderProductImagesRequest'
 *     responses:
 *       200:
 *         description: Images reordered
 */
router.patch("/:productId/images/reorder", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(product_image_validation_1.reorderProductImagesSchema), product_images_controller_1.ProductImagesController.reorder);
/**
 * @swagger
 * /products/{productId}/images/{imageId}/primary:
 *   patch:
 *     summary: Set the primary product image
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Primary image updated
 */
router.patch("/:productId/images/:imageId/primary", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), product_images_controller_1.ProductImagesController.setPrimary);
router.delete("/:productId/images/:imageId", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), product_images_controller_1.ProductImagesController.delete);
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
router.patch("/:id", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), (0, validate_1.validate)(product_validation_1.updateProductSchema), products_controller_1.ProductsController.update);
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
router.delete("/:id", (0, role_middleware_1.roleMiddleware)("STORE_OWNER", "STORE_ADMIN"), products_controller_1.ProductsController.delete);
exports.default = router;
