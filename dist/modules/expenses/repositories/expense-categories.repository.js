"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseCategoriesRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const categorySelect = {
    id: true,
    storeId: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { expenses: true } },
};
exports.ExpenseCategoriesRepository = {
    create(data) {
        return prisma_1.prisma.expenseCategory.create({
            data,
            select: categorySelect,
        });
    },
    findAll(storeId, includeInactive = false) {
        return prisma_1.prisma.expenseCategory.findMany({
            where: { storeId, ...(includeInactive ? {} : { isActive: true }) },
            select: categorySelect,
            orderBy: { name: "asc" },
        });
    },
    findById(id, storeId) {
        return prisma_1.prisma.expenseCategory.findFirst({
            where: { id, storeId },
            select: categorySelect,
        });
    },
    findByName(name, storeId) {
        return prisma_1.prisma.expenseCategory.findFirst({ where: { name, storeId } });
    },
    update(id, data) {
        return prisma_1.prisma.expenseCategory.update({
            where: { id },
            data,
            select: categorySelect,
        });
    },
    delete(id) {
        return prisma_1.prisma.expenseCategory.delete({ where: { id } });
    },
    countExpenses(id, storeId) {
        return prisma_1.prisma.expense.count({ where: { categoryId: id, storeId } });
    },
};
