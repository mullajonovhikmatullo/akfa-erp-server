import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateCategoryDto } from "../dto/create-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const CategoriesRepository = {
    create(data: CreateCategoryDto & { storeId: string }, client: DbClient = prisma) {
        return client.productCategory.create({ data });
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

    findById(id: string, storeId: string, client: DbClient = prisma) {
        return client.productCategory.findFirst({ where: { id, storeId } });
    },

    findByName(name: string, storeId: string, client: DbClient = prisma) {
        return client.productCategory.findFirst({ where: { name, storeId } });
    },

    update(id: string, storeId: string, data: UpdateCategoryDto, client: DbClient = prisma) {
        return client.productCategory.update({ where: { id, storeId }, data });
    },

    delete(id: string, storeId: string, client: DbClient = prisma) {
        return client.productCategory.delete({ where: { id, storeId } });
    },

    countProducts(id: string, storeId: string, client: DbClient = prisma) {
        return client.product.count({ where: { categoryId: id, storeId } });
    },
};
