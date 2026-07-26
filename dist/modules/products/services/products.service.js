"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const branch_access_1 = require("../../../core/utils/branch-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const categories_repository_1 = require("../repositories/categories.repository");
const products_repository_1 = require("../repositories/products.repository");
const product_images_service_1 = require("../images/services/product-images.service");
const product_presenter_1 = require("../presenters/product.presenter");
exports.ProductsService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const { branchId: requestedBranchId, ...productData } = dto;
        const [category, skuConflict] = await Promise.all([
            dto.categoryId ? categories_repository_1.CategoriesRepository.findById(dto.categoryId, storeId) : Promise.resolve(null),
            dto.sku ? products_repository_1.ProductsRepository.findBySku(dto.sku, storeId) : Promise.resolve(null),
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
        const branchId = requestedBranchId ?? await exports.ProductsService.findDefaultBranchId(storeId);
        if (!branchId)
            throw new AppError_1.AppError(404, "Branch not found");
        await (0, branch_access_1.assertBranchInStore)(branchId, storeId);
        const product = await products_repository_1.ProductsRepository.create({ ...productData, storeId }, branchId);
        return (0, product_presenter_1.serializeProductResponse)(product, false);
    },
    async findDefaultBranchId(storeId) {
        const namedMainBranch = await prisma_1.prisma.branch.findFirst({
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
        if (namedMainBranch)
            return namedMainBranch.id;
        const firstBranch = await prisma_1.prisma.branch.findFirst({
            where: { storeId },
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        return firstBranch?.id;
    },
    async findAll(filters, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const products = await products_repository_1.ProductsRepository.findAll({ ...filters, storeId });
        return products.map((product) => (0, product_presenter_1.serializeProductResponse)(product, false));
    },
    async findPaginated(params, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const { page, pageSize, ...filters } = params;
        const [items, total] = await Promise.all([
            products_repository_1.ProductsRepository.findPaginated({ ...filters, storeId }, page, pageSize),
            products_repository_1.ProductsRepository.count({ ...filters, storeId }),
        ]);
        return {
            items: items.map((product) => (0, product_presenter_1.serializeProductResponse)(product, false)),
            total,
        };
    },
    async summary(user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const [totalActive, totalInactive] = await Promise.all([
            products_repository_1.ProductsRepository.count({ storeId, isActive: true }),
            products_repository_1.ProductsRepository.count({ storeId, isActive: false }),
        ]);
        return { totalActive, totalInactive };
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const product = await products_repository_1.ProductsRepository.findById(id, storeId);
        if (!product) {
            throw new AppError_1.AppError(404, "Product not found");
        }
        return (0, product_presenter_1.serializeProductResponse)(product, true);
    },
    async findBySku(sku, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const product = await products_repository_1.ProductsRepository.findBySku(sku, storeId);
        if (!product) {
            throw new AppError_1.AppError(404, `No product found with SKU "${sku}"`);
        }
        return (0, product_presenter_1.serializeProductResponse)(product, false);
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        await exports.ProductsService.findById(id, user);
        if (dto.categoryId) {
            const category = await categories_repository_1.CategoriesRepository.findById(dto.categoryId, storeId);
            if (!category) {
                throw new AppError_1.AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError_1.AppError(409, "Cannot assign product to an inactive category");
            }
        }
        if (dto.sku) {
            const conflict = await products_repository_1.ProductsRepository.findBySku(dto.sku, storeId);
            if (conflict && conflict.id !== id) {
                throw new AppError_1.AppError(409, `SKU "${dto.sku}" is already in use`);
            }
        }
        const product = await products_repository_1.ProductsRepository.update(id, storeId, dto);
        return (0, product_presenter_1.serializeProductResponse)(product, false);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        await exports.ProductsService.findById(id, user);
        const result = await products_repository_1.ProductsRepository.delete(id, storeId);
        if (result.permanentlyDeleted) {
            await product_images_service_1.ProductImagesService.cleanupProductFiles(result.imageFiles);
        }
        return (0, product_presenter_1.serializeProductResponse)(result.product, false);
    },
};
