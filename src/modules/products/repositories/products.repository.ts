import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";

type ProductFilters = {
    storeId: string;
    categoryId?: string;
    unit?: string;
    isActive?: boolean;
    priceCurrency?: "UZS" | "USD";
    search?: string;
};

const productSelect = {
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
            const product = await tx.product.create({
                data,
                select: productSelect,
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
            select: productSelect,
            orderBy: { createdAt: "desc" },
        });
    },

    findPaginated(filters: ProductFilters, page: number, pageSize: number) {
        return prisma.product.findMany({
            where: buildWhere(filters),
            select: productSelect,
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
            select: productSelect,
        });
    },

    findBySku(sku: string, storeId: string) {
        return prisma.product.findFirst({
            where: { sku, storeId },
            select: productSelect,
        });
    },

    update(id: string, data: UpdateProductDto) {
        return prisma.product.update({
            where: { id },
            data,
            select: productSelect,
        });
    },

    async delete(id: string, storeId: string) {
        return prisma.$transaction(async (tx) => {
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

            await tx.inventory.deleteMany({ where: { productId: id, storeId } });
            return tx.product.delete({ where: { id }, select: productSelect });
        }, transactionOptions);
    },
};
