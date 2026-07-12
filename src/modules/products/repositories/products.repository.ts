import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";

type ProductFilters = {
    categoryId?: string;
    unit?: string;
    isActive?: boolean;
    search?: string;
};

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
} as const;

function buildWhere(filters: ProductFilters) {
    return {
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.unit && { unit: filters.unit as any }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
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
    create(data: Omit<CreateProductDto, "branchId">, branchId?: string) {
        return prisma.$transaction(async (tx) => {
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

    findById(id: string) {
        return prisma.product.findUnique({
            where: { id },
            select: productSelect,
        });
    },

    findBySku(sku: string) {
        return prisma.product.findUnique({
            where: { sku },
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

    async delete(id: string) {
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

            await tx.inventory.deleteMany({ where: { productId: id } });
            return tx.product.delete({ where: { id }, select: productSelect });
        }, transactionOptions);
    },
};
