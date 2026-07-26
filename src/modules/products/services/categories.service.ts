import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";
import { CategoriesRepository } from "../repositories/categories.repository";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";

export const CategoriesService = {
    async create(dto: CreateCategoryDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const existing = await CategoriesRepository.findByName(dto.name, storeId, tx);
            if (existing) {
                throw new AppError(409, `Category "${dto.name}" already exists`);
            }
            return CategoriesRepository.create({ ...dto, storeId }, tx);
        }, transactionOptions);
    },

    async findAll(isActive: boolean | undefined, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return CategoriesRepository.findAll(storeId, isActive);
    },

    async findPaginated({ page, pageSize, isActive, user }: { page: number; pageSize: number; isActive?: boolean; user: JwtPayload }) {
        const storeId = requireStoreId(user);
        const [items, total] = await Promise.all([
            CategoriesRepository.findPaginated({ storeId, page, pageSize, isActive }),
            CategoriesRepository.count(storeId, isActive),
        ]);
        return { items, total };
    },

    async summary(user: JwtPayload) {
        const storeId = requireStoreId(user);
        const [totalActive, totalInactive] = await Promise.all([
            CategoriesRepository.count(storeId, true),
            CategoriesRepository.count(storeId, false),
        ]);
        return { totalActive, totalInactive };
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const category = await CategoriesRepository.findById(id, storeId);
        if (!category) {
            throw new AppError(404, "Category not found");
        }
        return category;
    },

    async update(id: string, dto: UpdateCategoryDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const category = await CategoriesRepository.findById(id, storeId, tx);
            if (!category) throw new AppError(404, "Category not found");

            if (dto.name) {
                const existing = await CategoriesRepository.findByName(dto.name, storeId, tx);
                if (existing && existing.id !== id) {
                    throw new AppError(409, `Category "${dto.name}" already exists`);
                }
            }

            return CategoriesRepository.update(id, storeId, dto, tx);
        }, transactionOptions);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const category = await CategoriesRepository.findById(id, storeId, tx);
            if (!category) throw new AppError(404, "Category not found");

            const productCount = await CategoriesRepository.countProducts(id, storeId, tx);
            if (productCount > 0) {
                throw new AppError(
                    409,
                    `Cannot delete category: ${productCount} product(s) are assigned to it`
                );
            }

            return CategoriesRepository.delete(id, storeId, tx);
        }, transactionOptions);
    },
};
