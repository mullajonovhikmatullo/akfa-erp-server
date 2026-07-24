import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";

export const CategoriesRepository = {
    create(data: CreateCategoryDto & { storeId: string }) {
        return prisma.productCategory.create({ data });
    },

    findAll(storeId: string, isActive?: boolean) {
        return prisma.productCategory.findMany({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });
    },

    findPaginated({ storeId, page, pageSize, isActive }: { storeId: string; page: number; pageSize: number; isActive?: boolean }) {
        return prisma.productCategory.findMany({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },

    count(storeId: string, isActive?: boolean) {
        return prisma.productCategory.count({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
        });
    },

    findById(id: string, storeId: string) {
        return prisma.productCategory.findFirst({ where: { id, storeId } });
    },

    findByName(name: string, storeId: string) {
        return prisma.productCategory.findFirst({ where: { name, storeId } });
    },

    update(id: string, data: UpdateCategoryDto) {
        return prisma.productCategory.update({ where: { id }, data });
    },

    delete(id: string) {
        return prisma.productCategory.delete({ where: { id } });
    },

    countProducts(id: string, storeId: string) {
        return prisma.product.count({ where: { categoryId: id, storeId } });
    },
};
