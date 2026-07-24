import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, requireStoreId } from "../../../core/utils/branch-access";
import { CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CategoriesRepository } from "../repositories/categories.repository";
import { ProductsRepository } from "../repositories/products.repository";

type ProductFilters = {
    categoryId?: string;
    unit?: string;
    isActive?: boolean;
    priceCurrency?: "UZS" | "USD";
    search?: string;
};

export const ProductsService = {
    async create(dto: CreateProductDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const { branchId: requestedBranchId, ...productData } = dto;

        const [category, skuConflict] = await Promise.all([
            dto.categoryId ? CategoriesRepository.findById(dto.categoryId, storeId) : Promise.resolve(null),
            dto.sku ? ProductsRepository.findBySku(dto.sku, storeId) : Promise.resolve(null),
        ]);

        if (dto.categoryId) {
            if (!category) {
                throw new AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError(409, "Cannot assign product to an inactive category");
            }
        }
        if (skuConflict) {
            throw new AppError(409, `SKU "${dto.sku}" is already in use`);
        }

        const branchId = requestedBranchId ?? await ProductsService.findDefaultBranchId(storeId);
        if (!branchId) throw new AppError(404, "Branch not found");
        await assertBranchInStore(branchId, storeId);

        return ProductsRepository.create({ ...productData, storeId }, branchId);
    },

    async findDefaultBranchId(storeId: string) {
        const namedMainBranch = await prisma.branch.findFirst({
            where: {
                storeId,
                OR: [
                    { name: { contains: "main", mode: "insensitive" } },
                    { name: { contains: "asosiy", mode: "insensitive" } },
                    { name: { contains: "глав", mode: "insensitive" } },
                ],
            },
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        if (namedMainBranch) return namedMainBranch.id;

        const firstBranch = await prisma.branch.findFirst({
            where: { storeId },
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        return firstBranch?.id;
    },

    async findAll(filters: ProductFilters, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return ProductsRepository.findAll({ ...filters, storeId });
    },

    async findPaginated(params: ProductFilters & { page: number; pageSize: number }, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const { page, pageSize, ...filters } = params;
        const [items, total] = await Promise.all([
            ProductsRepository.findPaginated({ ...filters, storeId }, page, pageSize),
            ProductsRepository.count({ ...filters, storeId }),
        ]);
        return { items, total };
    },

    async summary(user: JwtPayload) {
        const storeId = requireStoreId(user);
        const [totalActive, totalInactive] = await Promise.all([
            ProductsRepository.count({ storeId, isActive: true }),
            ProductsRepository.count({ storeId, isActive: false }),
        ]);
        return { totalActive, totalInactive };
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const product = await ProductsRepository.findById(id, storeId);
        if (!product) {
            throw new AppError(404, "Product not found");
        }
        return product;
    },

    async findBySku(sku: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const product = await ProductsRepository.findBySku(sku, storeId);
        if (!product) {
            throw new AppError(404, `No product found with SKU "${sku}"`);
        }
        return product;
    },

    async update(id: string, dto: UpdateProductDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        await ProductsService.findById(id, user);

        if (dto.categoryId) {
            const category = await CategoriesRepository.findById(dto.categoryId, storeId);
            if (!category) {
                throw new AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError(409, "Cannot assign product to an inactive category");
            }
        }

        if (dto.sku) {
            const conflict = await ProductsRepository.findBySku(dto.sku, storeId);
            if (conflict && conflict.id !== id) {
                throw new AppError(409, `SKU "${dto.sku}" is already in use`);
            }
        }

        return ProductsRepository.update(id, dto);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        await ProductsService.findById(id, user);
        return ProductsRepository.delete(id, storeId);
    },
};
