"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const productSelect = {
    id: true,
    name: true,
    description: true,
    sku: true,
    unit: true,
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
function buildWhere(filters) {
    return {
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.unit && { unit: filters.unit }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
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
            const product = await tx.product.create({
                data,
                select: productSelect,
            });
            if (branchId) {
                await tx.inventory.create({
                    data: {
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
            select: productSelect,
            orderBy: { createdAt: "desc" },
        });
    },
    findPaginated(filters, page, pageSize) {
        return prisma_1.prisma.product.findMany({
            where: buildWhere(filters),
            select: productSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(filters) {
        return prisma_1.prisma.product.count({ where: buildWhere(filters) });
    },
    findById(id) {
        return prisma_1.prisma.product.findUnique({
            where: { id },
            select: productSelect,
        });
    },
    findBySku(sku) {
        return prisma_1.prisma.product.findUnique({
            where: { sku },
            select: productSelect,
        });
    },
    update(id, data) {
        return prisma_1.prisma.product.update({
            where: { id },
            data,
            select: productSelect,
        });
    },
    async delete(id) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const [stockBatches, stockMovements, saleItems, transferItems] = await Promise.all([
                tx.stockBatch.count({ where: { productId: id } }),
                tx.stockMovement.count({ where: { productId: id } }),
                tx.saleItem.count({ where: { productId: id } }),
                tx.transferItem.count({ where: { productId: id } }),
            ]);
            const hasHistory = stockBatches + stockMovements + saleItems + transferItems > 0;
            if (hasHistory) {
                return tx.product.update({
                    where: { id },
                    data: { isActive: false },
                    select: productSelect,
                });
            }
            await tx.inventory.deleteMany({ where: { productId: id } });
            return tx.product.delete({ where: { id }, select: productSelect });
        }, prisma_1.transactionOptions);
    },
};
