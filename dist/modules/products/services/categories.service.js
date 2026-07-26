"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const categories_repository_1 = require("../repositories/categories.repository");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.CategoriesService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name, storeId, tx);
            if (existing) {
                throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
            }
            return categories_repository_1.CategoriesRepository.create({ ...dto, storeId }, tx);
        }, prisma_1.transactionOptions);
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
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const category = await categories_repository_1.CategoriesRepository.findById(id, storeId, tx);
            if (!category)
                throw new AppError_1.AppError(404, "Category not found");
            if (dto.name) {
                const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name, storeId, tx);
                if (existing && existing.id !== id) {
                    throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
                }
            }
            return categories_repository_1.CategoriesRepository.update(id, storeId, dto, tx);
        }, prisma_1.transactionOptions);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const category = await categories_repository_1.CategoriesRepository.findById(id, storeId, tx);
            if (!category)
                throw new AppError_1.AppError(404, "Category not found");
            const productCount = await categories_repository_1.CategoriesRepository.countProducts(id, storeId, tx);
            if (productCount > 0) {
                throw new AppError_1.AppError(409, `Cannot delete category: ${productCount} product(s) are assigned to it`);
            }
            return categories_repository_1.CategoriesRepository.delete(id, storeId, tx);
        }, prisma_1.transactionOptions);
    },
};
