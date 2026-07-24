"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const branch_access_1 = require("../../../core/utils/branch-access");
const categories_repository_1 = require("../repositories/categories.repository");
exports.CategoriesService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name, storeId);
        if (existing) {
            throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
        }
        return categories_repository_1.CategoriesRepository.create({ ...dto, storeId });
    },
    async findAll(isActive, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return categories_repository_1.CategoriesRepository.findAll(storeId, isActive);
    },
    async findPaginated({ page, pageSize, isActive, user }) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const [items, total] = await Promise.all([
            categories_repository_1.CategoriesRepository.findPaginated({ storeId, page, pageSize, isActive }),
            categories_repository_1.CategoriesRepository.count(storeId, isActive),
        ]);
        return { items, total };
    },
    async summary(user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const [totalActive, totalInactive] = await Promise.all([
            categories_repository_1.CategoriesRepository.count(storeId, true),
            categories_repository_1.CategoriesRepository.count(storeId, false),
        ]);
        return { totalActive, totalInactive };
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const category = await categories_repository_1.CategoriesRepository.findById(id, storeId);
        if (!category) {
            throw new AppError_1.AppError(404, "Category not found");
        }
        return category;
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        await exports.CategoriesService.findById(id, user);
        if (dto.name) {
            const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name, storeId);
            if (existing && existing.id !== id) {
                throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
            }
        }
        return categories_repository_1.CategoriesRepository.update(id, dto);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        await exports.CategoriesService.findById(id, user);
        const productCount = await categories_repository_1.CategoriesRepository.countProducts(id, storeId);
        if (productCount > 0) {
            throw new AppError_1.AppError(409, `Cannot delete category: ${productCount} product(s) are assigned to it`);
        }
        return categories_repository_1.CategoriesRepository.delete(id);
    },
};
