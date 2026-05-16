import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";

export const CategoriesRepository = {
    create(data: CreateCategoryDto) {
        return prisma.productCategory.create({ data });
    },

    findAll(isActive?: boolean) {
        return prisma.productCategory.findMany({
            where: isActive !== undefined ? { isActive } : undefined,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });
    },

    findPaginated({ page, pageSize, isActive }: { page: number; pageSize: number; isActive?: boolean }) {
        return prisma.productCategory.findMany({
            where: isActive !== undefined ? { isActive } : undefined,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },

    count(isActive?: boolean) {
        return prisma.productCategory.count({
            where: isActive !== undefined ? { isActive } : undefined,
        });
    },

    findById(id: string) {
        return prisma.productCategory.findUnique({ where: { id } });
    },

    findByName(name: string) {
        return prisma.productCategory.findUnique({ where: { name } });
    },

    update(id: string, data: UpdateCategoryDto) {
        return prisma.productCategory.update({ where: { id }, data });
    },

    delete(id: string) {
        return prisma.productCategory.delete({ where: { id } });
    },

    countProducts(id: string) {
        return prisma.product.count({ where: { categoryId: id } });
    },
};
