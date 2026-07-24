import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from "../dto/create-expense-category.dto";

const categorySelect = {
    id: true,
    storeId: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { expenses: true } },
} as const;

export const ExpenseCategoriesRepository = {
    create(data: CreateExpenseCategoryDto & { storeId: string }) {
        return prisma.expenseCategory.create({
            data,
            select: categorySelect,
        });
    },

    findAll(storeId: string, includeInactive = false) {
        return prisma.expenseCategory.findMany({
            where: { storeId, ...(includeInactive ? {} : { isActive: true }) },
            select: categorySelect,
            orderBy: { name: "asc" },
        });
    },

    findById(id: string, storeId: string) {
        return prisma.expenseCategory.findFirst({
            where: { id, storeId },
            select: categorySelect,
        });
    },

    findByName(name: string, storeId: string) {
        return prisma.expenseCategory.findFirst({ where: { name, storeId } });
    },

    update(id: string, data: UpdateExpenseCategoryDto) {
        return prisma.expenseCategory.update({
            where: { id },
            data,
            select: categorySelect,
        });
    },

    delete(id: string) {
        return prisma.expenseCategory.delete({ where: { id } });
    },

    countExpenses(id: string, storeId: string) {
        return prisma.expense.count({ where: { categoryId: id, storeId } });
    },
};
