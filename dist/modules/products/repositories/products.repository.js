"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const AppError_1 = require("../../../core/errors/AppError");
const product_images_repository_1 = require("../images/repositories/product-images.repository");
const productBaseSelect = {
    id: true,
    storeId: true,
    name: true,
    description: true,
    sku: true,
    unit: true,
    lowStockThreshold: true,
    costPriceUzs: true,
    retailPriceUzs: true,
    wholesalePriceUzs: true,
    costPriceUsd: true,
    retailPriceUsd: true,
    wholesalePriceUsd: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    category: {
        select: { id: true, name: true },
    },
};
const productListSelect = {
    ...productBaseSelect,
    images: {
        where: { isPrimary: true },
        select: product_images_repository_1.productImageSelect,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
    },
    _count: { select: { images: true } },
};
const productDetailSelect = {
    ...productBaseSelect,
    images: {
        select: product_images_repository_1.productImageSelect,
        orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
        ],
    },
    _count: { select: { images: true } },
};
function buildWhere(filters) {
    const usdPriceWhere = {
        costPriceUzs: { equals: 0 },
        retailPriceUzs: { equals: 0 },
        wholesalePriceUzs: { equals: 0 },
        costPriceUsd: { gt: 0 },
        retailPriceUsd: { gt: 0 },
        wholesalePriceUsd: { gt: 0 },
    };
    return {
        storeId: filters.storeId,
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.unit && { unit: filters.unit }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.priceCurrency === "USD" && usdPriceWhere),
        ...(filters.priceCurrency === "UZS" && {
            NOT: usdPriceWhere,
        }),
        ...(filters.search && {
            OR: [
                { name: { contains: filters.search, mode: "insensitive" } },
                { sku: { contains: filters.search, mode: "insensitive" } },
                { description: { contains: filters.search, mode: "insensitive" } },
            ],
        }),
    };
}
exports.ProductsRepository = {
    create(data, branchId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.assertPlanCapacity)(tx, data.storeId, "products");
            const product = await tx.product.create({
                data,
                select: productListSelect,
            });
            if (branchId) {
                await tx.inventory.create({
                    data: {
                        storeId: data.storeId,
                        branchId,
                        productId: product.id,
                        quantity: 0,
                    },
                });
            }
            return product;
        }, prisma_1.transactionOptions);
    },
    findAll(filters) {
        return prisma_1.prisma.product.findMany({
            where: buildWhere(filters),
            select: productListSelect,
            orderBy: { createdAt: "desc" },
        });
    },
    findPaginated(filters, page, pageSize) {
        return prisma_1.prisma.product.findMany({
            where: buildWhere(filters),
            select: productListSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(filters) {
        return prisma_1.prisma.product.count({ where: buildWhere(filters) });
    },
    findById(id, storeId) {
        return prisma_1.prisma.product.findFirst({
            where: { id, storeId },
            select: productDetailSelect,
        });
    },
    findBySku(sku, storeId) {
        return prisma_1.prisma.product.findFirst({
            where: { sku, storeId },
            select: productListSelect,
        });
    },
    update(id, storeId, data) {
        if (data.isActive !== true) {
            return prisma_1.prisma.$transaction(async (tx) => {
                await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
                return tx.product.update({
                    where: { id, storeId },
                    data,
                    select: productListSelect,
                });
            }, prisma_1.transactionOptions);
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const current = await tx.product.findFirst({
                where: { id, storeId },
                select: { isActive: true },
            });
            if (!current)
                throw new AppError_1.AppError(404, "Product not found");
            if (!current.isActive) {
                await (0, plan_limit_service_1.assertPlanCapacity)(tx, storeId, "products");
            }
            return tx.product.update({
                where: { id, storeId },
                data,
                select: productListSelect,
            });
        }, prisma_1.transactionOptions);
    },
    async delete(id, storeId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const [stockBatches, stockMovements, saleItems, transferItems] = await Promise.all([
                tx.stockBatch.count({ where: { productId: id, storeId } }),
                tx.stockMovement.count({ where: { productId: id, storeId } }),
                tx.saleItem.count({ where: { productId: id, sale: { storeId } } }),
                tx.transferItem.count({ where: { productId: id, transfer: { storeId } } }),
            ]);
            const hasHistory = stockBatches + stockMovements + saleItems + transferItems > 0;
            if (hasHistory) {
                const product = await tx.product.update({
                    where: { id, storeId },
                    data: { isActive: false },
                    select: productListSelect,
                });
                return {
                    product,
                    permanentlyDeleted: false,
                    imageFiles: [],
                };
            }
            const imageFiles = await tx.productImage.findMany({
                where: { productId: id, storeId },
                select: {
                    storageKey: true,
                    thumbnailStorageKey: true,
                },
            });
            await tx.inventory.deleteMany({ where: { productId: id, storeId } });
            const product = await tx.product.delete({
                where: { id, storeId },
                select: productListSelect,
            });
            return {
                product,
                permanentlyDeleted: true,
                imageFiles,
            };
        }, prisma_1.transactionOptions);
    },
};
