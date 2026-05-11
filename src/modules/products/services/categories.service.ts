import { AppError } from "../../../core/errors/AppError";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";
import { CategoriesRepository } from "../repositories/categories.repository";

export const CategoriesService = {
    async create(dto: CreateCategoryDto) {
        const existing = await CategoriesRepository.findByName(dto.name);
        if (existing) {
            throw new AppError(409, `Category "${dto.name}" already exists`);
        }
        return CategoriesRepository.create(dto);
    },

    async findAll(isActive?: boolean) {
        return CategoriesRepository.findAll(isActive);
    },

    async findById(id: string) {
        const category = await CategoriesRepository.findById(id);
        if (!category) {
            throw new AppError(404, "Category not found");
        }
        return category;
    },

    async update(id: string, dto: UpdateCategoryDto) {
        await CategoriesService.findById(id);

        if (dto.name) {
            const existing = await CategoriesRepository.findByName(dto.name);
            if (existing && existing.id !== id) {
                throw new AppError(409, `Category "${dto.name}" already exists`);
            }
        }

        return CategoriesRepository.update(id, dto);
    },

    async delete(id: string) {
        await CategoriesService.findById(id);

        const productCount = await CategoriesRepository.countProducts(id);
        if (productCount > 0) {
            throw new AppError(
                409,
                `Cannot delete category: ${productCount} product(s) are assigned to it`
            );
        }

        return CategoriesRepository.delete(id);
    },
};
