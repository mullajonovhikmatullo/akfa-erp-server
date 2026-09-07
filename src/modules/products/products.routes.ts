import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { roleMiddleware } from "../auth/middleware/role.middleware";
import { validate } from "../../core/middleware/validate";
import {
    createProductSchema,
    updateProductSchema,
} from "./validations/product.validation";
import {
    createCategorySchema,
    updateCategorySchema,
} from "./validations/category.validation";
import { ProductsController } from "./controllers/products.controller";
import { CategoriesController } from "./controllers/categories.controller";
import { ProductImagesController } from "./images/controllers/product-images.controller";
import { productImageUpload } from "./images/middleware/product-image-upload.middleware";
import { reorderProductImagesSchema } from "./images/validations/product-image.validation";

const router = Router();

// All product/category routes require authentication
router.use(authMiddleware);

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
router.post(
    "/categories",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(createCategorySchema),
    CategoriesController.create
);

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
router.get("/categories", CategoriesController.findAll);

router.get("/categories/summary", CategoriesController.summary);

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
router.get("/categories/:id", CategoriesController.findById);

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
router.patch(
    "/categories/:id",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(updateCategorySchema),
    CategoriesController.update
);

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
router.delete(
    "/categories/:id",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    CategoriesController.delete
);

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
router.post(
    "/",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(createProductSchema),
    ProductsController.create
);

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
router.get("/", ProductsController.findAll);

router.get("/summary", ProductsController.summary);

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
router.post(
    "/:productId/images",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    productImageUpload,
    ProductImagesController.upload
);

router.get("/:productId/images", ProductImagesController.list);

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
router.put(
    "/:productId/images/:imageId",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    productImageUpload,
    ProductImagesController.replace
);

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
router.patch(
    "/:productId/images/reorder",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(reorderProductImagesSchema),
    ProductImagesController.reorder
);

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
router.patch(
    "/:productId/images/:imageId/primary",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    ProductImagesController.setPrimary
);

router.delete(
    "/:productId/images/:imageId",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    ProductImagesController.delete
);

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
router.get("/sku/:sku", ProductsController.findBySku);

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
router.get("/:id", ProductsController.findById);

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
router.patch(
    "/:id",
    roleMiddleware("STORE_OWNER", "STORE_ADMIN"),
    validate(updateProductSchema),
    ProductsController.update
);

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
router.delete("/:id", roleMiddleware("STORE_OWNER", "STORE_ADMIN"), ProductsController.delete);

export default router;
