"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const categories_repository_1 = require("../repositories/categories.repository");
exports.CategoriesService = {
    async create(dto) {
        const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name);
        if (existing) {
            throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
        }
        return categories_repository_1.CategoriesRepository.create(dto);
    },
    async findAll(isActive) {
        return categories_repository_1.CategoriesRepository.findAll(isActive);
    },
    async findPaginated({ page, pageSize, isActive }) {
        const [items, total, totalActive, totalInactive] = await Promise.all([
            categories_repository_1.CategoriesRepository.findPaginated({ page, pageSize, isActive }),
            categories_repository_1.CategoriesRepository.count(isActive),
            categories_repository_1.CategoriesRepository.count(true),
            categories_repository_1.CategoriesRepository.count(false),
        ]);
        return { items, total, totalActive, totalInactive };
    },
    async findById(id) {
        const category = await categories_repository_1.CategoriesRepository.findById(id);
        if (!category) {
            throw new AppError_1.AppError(404, "Category not found");
        }
        return category;
    },
    async update(id, dto) {
        await exports.CategoriesService.findById(id);
        if (dto.name) {
            const existing = await categories_repository_1.CategoriesRepository.findByName(dto.name);
            if (existing && existing.id !== id) {
                throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
            }
        }
        return categories_repository_1.CategoriesRepository.update(id, dto);
    },
    async delete(id) {
        await exports.CategoriesService.findById(id);
        const productCount = await categories_repository_1.CategoriesRepository.countProducts(id);
        if (productCount > 0) {
            throw new AppError_1.AppError(409, `Cannot delete category: ${productCount} product(s) are assigned to it`);
        }
        return categories_repository_1.CategoriesRepository.delete(id);
    },
};
