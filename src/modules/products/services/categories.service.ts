import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";
import { CategoriesRepository } from "../repositories/categories.repository";

export const CategoriesService = {
    async create(dto: CreateCategoryDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const existing = await CategoriesRepository.findByName(dto.name, storeId);
        if (existing) {
            throw new AppError(409, `Category "${dto.name}" already exists`);
        }
        return CategoriesRepository.create({ ...dto, storeId });
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
        await CategoriesService.findById(id, user);

        if (dto.name) {
            const existing = await CategoriesRepository.findByName(dto.name, storeId);
            if (existing && existing.id !== id) {
                throw new AppError(409, `Category "${dto.name}" already exists`);
            }
        }

        return CategoriesRepository.update(id, dto);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        await CategoriesService.findById(id, user);

        const productCount = await CategoriesRepository.countProducts(id, storeId);
        if (productCount > 0) {
            throw new AppError(
                409,
                `Cannot delete category: ${productCount} product(s) are assigned to it`
            );
        }

        return CategoriesRepository.delete(id);
    },
};
