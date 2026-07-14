"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const categories_repository_1 = require("../repositories/categories.repository");
const products_repository_1 = require("../repositories/products.repository");
exports.ProductsService = {
    async create(dto) {
        const { branchId: requestedBranchId, ...productData } = dto;
        const [category, skuConflict] = await Promise.all([
            dto.categoryId ? categories_repository_1.CategoriesRepository.findById(dto.categoryId) : Promise.resolve(null),
            dto.sku ? products_repository_1.ProductsRepository.findBySku(dto.sku) : Promise.resolve(null),
        ]);
        if (dto.categoryId) {
            if (!category) {
                throw new AppError_1.AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError_1.AppError(409, "Cannot assign product to an inactive category");
            }
        }
        if (skuConflict) {
            throw new AppError_1.AppError(409, `SKU "${dto.sku}" is already in use`);
        }
        const branchId = requestedBranchId ?? await exports.ProductsService.findDefaultBranchId();
        const branch = branchId
            ? await prisma_1.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })
            : null;
        if (!branch) {
            throw new AppError_1.AppError(404, "Branch not found");
        }
        return products_repository_1.ProductsRepository.create(productData, branchId);
    },
    async findDefaultBranchId() {
        const namedMainBranch = await prisma_1.prisma.branch.findFirst({
            where: {
                OR: [
                    { name: { contains: "main", mode: "insensitive" } },
                    { name: { contains: "asosiy", mode: "insensitive" } },
                    { name: { contains: "глав", mode: "insensitive" } },
                ],
            },
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        if (namedMainBranch)
            return namedMainBranch.id;
        const firstBranch = await prisma_1.prisma.branch.findFirst({
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        return firstBranch?.id;
    },
    async findAll(filters) {
        return products_repository_1.ProductsRepository.findAll(filters);
    },
    async findPaginated(params) {
        const { page, pageSize, ...filters } = params;
        const [items, total] = await Promise.all([
            products_repository_1.ProductsRepository.findPaginated(filters, page, pageSize),
            products_repository_1.ProductsRepository.count(filters),
        ]);
        return { items, total };
    },
    async findById(id) {
        const product = await products_repository_1.ProductsRepository.findById(id);
        if (!product) {
            throw new AppError_1.AppError(404, "Product not found");
        }
        return product;
    },
    async findBySku(sku) {
        const product = await products_repository_1.ProductsRepository.findBySku(sku);
        if (!product) {
            throw new AppError_1.AppError(404, `No product found with SKU "${sku}"`);
        }
        return product;
    },
    async update(id, dto) {
        await exports.ProductsService.findById(id);
        if (dto.categoryId) {
            const category = await categories_repository_1.CategoriesRepository.findById(dto.categoryId);
            if (!category) {
                throw new AppError_1.AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError_1.AppError(409, "Cannot assign product to an inactive category");
            }
        }
        if (dto.sku) {
            const conflict = await products_repository_1.ProductsRepository.findBySku(dto.sku);
            if (conflict && conflict.id !== id) {
                throw new AppError_1.AppError(409, `SKU "${dto.sku}" is already in use`);
            }
        }
        return products_repository_1.ProductsRepository.update(id, dto);
    },
    async delete(id) {
        await exports.ProductsService.findById(id);
        return products_repository_1.ProductsRepository.delete(id);
    },
};
