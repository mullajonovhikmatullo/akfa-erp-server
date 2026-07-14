"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.CategoriesRepository = {
    create(data) {
        return prisma_1.prisma.productCategory.create({ data });
    },
    findAll(isActive) {
        return prisma_1.prisma.productCategory.findMany({
            where: isActive !== undefined ? { isActive } : undefined,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });
    },
    findPaginated({ page, pageSize, isActive }) {
        return prisma_1.prisma.productCategory.findMany({
            where: isActive !== undefined ? { isActive } : undefined,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(isActive) {
        return prisma_1.prisma.productCategory.count({
            where: isActive !== undefined ? { isActive } : undefined,
        });
    },
    findById(id) {
        return prisma_1.prisma.productCategory.findUnique({ where: { id } });
    },
    findByName(name) {
        return prisma_1.prisma.productCategory.findUnique({ where: { name } });
    },
    update(id, data) {
        return prisma_1.prisma.productCategory.update({ where: { id }, data });
    },
    delete(id) {
        return prisma_1.prisma.productCategory.delete({ where: { id } });
    },
    countProducts(id) {
        return prisma_1.prisma.product.count({ where: { categoryId: id } });
    },
};
