"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductImagesRepository = exports.productImageSelect = void 0;
const prisma_1 = require("../../../../infrastructure/prisma/prisma");
exports.productImageSelect = {
    id: true,
    storeId: true,
    productId: true,
    storageKey: true,
    thumbnailStorageKey: true,
    originalFilename: true,
    mimeType: true,
    fileSize: true,
    width: true,
    height: true,
    isPrimary: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
};
exports.ProductImagesRepository = {
    findTenantProduct(productId, storeId) {
        return prisma_1.prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true, storeId: true },
        });
    },
    list(productId, storeId) {
        return prisma_1.prisma.productImage.findMany({
            where: { productId, storeId },
            select: exports.productImageSelect,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        });
    },
    findImage(imageId, productId, storeId) {
        return prisma_1.prisma.productImage.findFirst({
            where: { id: imageId, productId, storeId },
            select: exports.productImageSelect,
        });
    },
    transaction(callback) {
        return prisma_1.prisma.$transaction(callback, prisma_1.transactionOptions);
    },
    async lockTenantProduct(tx, productId, storeId) {
        const rows = await tx.$queryRaw `
            SELECT "id"
            FROM "Product"
            WHERE "id" = ${productId} AND "storeId" = ${storeId}
            FOR UPDATE
        `;
        return rows[0] ?? null;
    },
};
