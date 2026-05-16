import { AppError } from "../../../core/errors/AppError";
import { CreateProductDto } from "../dto/create-product.dto";
import { UpdateProductDto } from "../dto/update-product.dto";
import { CategoriesRepository } from "../repositories/categories.repository";
import { ProductsRepository } from "../repositories/products.repository";

type ProductFilters = {
    categoryId?: string;
    unit?: string;
    isActive?: boolean;
    search?: string;
};

export const ProductsService = {
    async create(dto: CreateProductDto) {
        const [category, skuConflict] = await Promise.all([
            CategoriesRepository.findById(dto.categoryId),
            dto.sku ? ProductsRepository.findBySku(dto.sku) : Promise.resolve(null),
        ]);

        if (!category) {
            throw new AppError(404, "Category not found");
        }
        if (!category.isActive) {
            throw new AppError(409, "Cannot assign product to an inactive category");
        }
        if (skuConflict) {
            throw new AppError(409, `SKU "${dto.sku}" is already in use`);
        }

        return ProductsRepository.create(dto);
    },

    async findAll(filters: ProductFilters) {
        return ProductsRepository.findAll(filters);
    },

    async findPaginated(params: ProductFilters & { page: number; pageSize: number }) {
        const { page, pageSize, ...filters } = params;
        const [items, total] = await Promise.all([
            ProductsRepository.findPaginated(filters, page, pageSize),
            ProductsRepository.count(filters),
        ]);
        return { items, total };
    },

    async findById(id: string) {
        const product = await ProductsRepository.findById(id);
        if (!product) {
            throw new AppError(404, "Product not found");
        }
        return product;
    },

    async findBySku(sku: string) {
        const product = await ProductsRepository.findBySku(sku);
        if (!product) {
            throw new AppError(404, `No product found with SKU "${sku}"`);
        }
        return product;
    },

    async update(id: string, dto: UpdateProductDto) {
        await ProductsService.findById(id);

        if (dto.categoryId) {
            const category = await CategoriesRepository.findById(dto.categoryId);
            if (!category) {
                throw new AppError(404, "Category not found");
            }
            if (!category.isActive) {
                throw new AppError(409, "Cannot assign product to an inactive category");
            }
        }

        if (dto.sku) {
            const conflict = await ProductsRepository.findBySku(dto.sku);
            if (conflict && conflict.id !== id) {
                throw new AppError(409, `SKU "${dto.sku}" is already in use`);
            }
        }

        return ProductsRepository.update(id, dto);
    },

    async delete(id: string) {
        await ProductsService.findById(id);
        return ProductsRepository.delete(id);
    },
};
