"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.CategoriesRepository = {
    create(data, client = prisma_1.prisma) {
        return client.productCategory.create({ data });
    },
    findAll(storeId, isActive) {
        return prisma_1.prisma.productCategory.findMany({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });
    },
    findPaginated({ storeId, page, pageSize, isActive }) {
        return prisma_1.prisma.productCategory.findMany({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(storeId, isActive) {
        return prisma_1.prisma.productCategory.count({
            where: { storeId, ...(isActive !== undefined && { isActive }) },
        });
    },
    findById(id, storeId, client = prisma_1.prisma) {
        return client.productCategory.findFirst({ where: { id, storeId } });
    },
    findByName(name, storeId, client = prisma_1.prisma) {
        return client.productCategory.findFirst({ where: { name, storeId } });
    },
    update(id, storeId, data, client = prisma_1.prisma) {
        return client.productCategory.update({ where: { id, storeId }, data });
    },
    delete(id, storeId, client = prisma_1.prisma) {
        return client.productCategory.delete({ where: { id, storeId } });
    },
    countProducts(id, storeId, client = prisma_1.prisma) {
        return client.product.count({ where: { categoryId: id, storeId } });
    },
};
