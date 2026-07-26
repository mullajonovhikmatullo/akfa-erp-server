import { Prisma } from "@prisma/client";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { assertPlanCapacity } from "../../../core/services/plan-limit.service";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { AppError } from "../../../core/errors/AppError";
import { productImageSelect } from "../images/repositories/product-images.repository";

type ProductFilters = {
    storeId: string;
    categoryId?: string;
    unit?: string;
    isActive?: boolean;
    priceCurrency?: "UZS" | "USD";
    search?: string;
};

const productBaseSelect = {
    id: true,
    storeId: true,
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
} as const;

const productListSelect = {
    ...productBaseSelect,
    images: {
        where: { isPrimary: true },
        select: productImageSelect,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
    },
    _count: { select: { images: true } },
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
    ...productBaseSelect,
    images: {
        select: productImageSelect,
        orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
        ],
    },
    _count: { select: { images: true } },
} satisfies Prisma.ProductSelect;

function buildWhere(filters: ProductFilters) {
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
        ...(filters.unit && { unit: filters.unit as any }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.priceCurrency === "USD" && usdPriceWhere),
        ...(filters.priceCurrency === "UZS" && {
            NOT: usdPriceWhere,
        }),
        ...(filters.search && {
            OR: [
                { name: { contains: filters.search, mode: "insensitive" as const } },
                { sku: { contains: filters.search, mode: "insensitive" as const } },
                { description: { contains: filters.search, mode: "insensitive" as const } },
            ],
        }),
    };
}

export const ProductsRepository = {
    create(data: Omit<CreateProductDto, "branchId"> & { storeId: string }, branchId?: string) {
        return prisma.$transaction(async (tx) => {
            await assertPlanCapacity(tx, data.storeId, "products");
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
        }, transactionOptions);
    },

    findAll(filters: ProductFilters) {
        return prisma.product.findMany({
            where: buildWhere(filters),
            select: productListSelect,
            orderBy: { createdAt: "desc" },
        });
    },

    findPaginated(filters: ProductFilters, page: number, pageSize: number) {
        return prisma.product.findMany({
            where: buildWhere(filters),
            select: productListSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },

    count(filters: ProductFilters) {
        return prisma.product.count({ where: buildWhere(filters) });
    },

    findById(id: string, storeId: string) {
        return prisma.product.findFirst({
            where: { id, storeId },
            select: productDetailSelect,
        });
    },

    findBySku(sku: string, storeId: string) {
        return prisma.product.findFirst({
            where: { sku, storeId },
            select: productListSelect,
        });
    },

    update(id: string, storeId: string, data: UpdateProductDto) {
        if (data.isActive !== true) {
            return prisma.$transaction(async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId);
                return tx.product.update({
                    where: { id, storeId },
                    data,
                    select: productListSelect,
                });
            }, transactionOptions);
        }

        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const current = await tx.product.findFirst({
                where: { id, storeId },
                select: { isActive: true },
            });
            if (!current) throw new AppError(404, "Product not found");
            if (!current.isActive) {
                await assertPlanCapacity(tx, storeId, "products");
            }
            return tx.product.update({
                where: { id, storeId },
                data,
                select: productListSelect,
            });
        }, transactionOptions);
    },

    async delete(id: string, storeId: string) {
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
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
        }, transactionOptions);
    },
};
