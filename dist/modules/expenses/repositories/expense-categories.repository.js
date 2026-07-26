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
    create(data, client = prisma_1.prisma) {
        return client.expenseCategory.create({
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
    findById(id, storeId, client = prisma_1.prisma) {
        return client.expenseCategory.findFirst({
            where: { id, storeId },
            select: categorySelect,
        });
    },
    findByName(name, storeId, client = prisma_1.prisma) {
        return client.expenseCategory.findFirst({ where: { name, storeId } });
    },
    update(id, storeId, data, client = prisma_1.prisma) {
        return client.expenseCategory.update({
            where: { id, storeId },
            data,
            select: categorySelect,
        });
    },
    delete(id, storeId, client = prisma_1.prisma) {
        return client.expenseCategory.delete({ where: { id, storeId } });
    },
    countExpenses(id, storeId, client = prisma_1.prisma) {
        return client.expense.count({ where: { categoryId: id, storeId } });
    },
};
