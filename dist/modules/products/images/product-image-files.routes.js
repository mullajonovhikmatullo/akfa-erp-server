"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_images_controller_1 = require("./controllers/product-images.controller");
const router = (0, express_1.Router)();
/**
 * @swagger
 * /uploads/organizations/{storeId}/products/{productId}/{imageId}/{fileName}:
 *   get:
 *     summary: Read an authenticated product image variant
 *     tags: [Product Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [main.webp, thumbnail.webp]
 *     responses:
 *       200:
 *         description: WebP image bytes
 *         content:
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image not found in the authenticated store
 */
router.get("/organizations/:storeId/products/:productId/:imageId/:fileName", product_images_controller_1.ProductImagesController.file);
exports.default = router;
