import { prisma } from "../../../infrastructure/prisma/prisma";
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
    retailPriceUzs: true,
    wholesalePriceUzs: true,
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
    create(data: CreateProductDto) {
        return prisma.product.create({
            data,
            select: productSelect,
        });
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

    delete(id: string) {
        return prisma.product.delete({ where: { id } });
    },
};
