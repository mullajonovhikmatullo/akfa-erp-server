import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from "../dto/create-expense-category.dto";

const categorySelect = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { expenses: true } },
} as const;

export const ExpenseCategoriesRepository = {
    create(data: CreateExpenseCategoryDto) {
        return prisma.expenseCategory.create({
            data,
            select: categorySelect,
        });
    },

    findAll(includeInactive = false) {
        return prisma.expenseCategory.findMany({
            where: includeInactive ? undefined : { isActive: true },
            select: categorySelect,
            orderBy: { name: "asc" },
        });
    },

    findById(id: string) {
        return prisma.expenseCategory.findUnique({
            where: { id },
            select: categorySelect,
        });
    },

    findByName(name: string) {
        return prisma.expenseCategory.findUnique({ where: { name } });
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

    countExpenses(id: string) {
        return prisma.expense.count({ where: { categoryId: id } });
    },
};
