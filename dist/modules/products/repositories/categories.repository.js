"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.CategoriesRepository = {
    create(data) {
        return prisma_1.prisma.productCategory.create({ data });
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
    findById(id, storeId) {
        return prisma_1.prisma.productCategory.findFirst({ where: { id, storeId } });
    },
    findByName(name, storeId) {
        return prisma_1.prisma.productCategory.findFirst({ where: { name, storeId } });
    },
    update(id, data) {
        return prisma_1.prisma.productCategory.update({ where: { id }, data });
    },
    delete(id) {
        return prisma_1.prisma.productCategory.delete({ where: { id } });
    },
    countProducts(id, storeId) {
        return prisma_1.prisma.product.count({ where: { categoryId: id, storeId } });
    },
};
