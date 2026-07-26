import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from "../dto/create-expense-category.dto";

type DbClient = typeof prisma | Prisma.TransactionClient;

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
    create(data: CreateExpenseCategoryDto & { storeId: string }, client: DbClient = prisma) {
        return client.expenseCategory.create({
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

    findById(id: string, storeId: string, client: DbClient = prisma) {
        return client.expenseCategory.findFirst({
            where: { id, storeId },
            select: categorySelect,
        });
    },

    findByName(name: string, storeId: string, client: DbClient = prisma) {
        return client.expenseCategory.findFirst({ where: { name, storeId } });
    },

    update(id: string, storeId: string, data: UpdateExpenseCategoryDto, client: DbClient = prisma) {
        return client.expenseCategory.update({
            where: { id, storeId },
            data,
            select: categorySelect,
        });
    },

    delete(id: string, storeId: string, client: DbClient = prisma) {
        return client.expenseCategory.delete({ where: { id, storeId } });
    },

    countExpenses(id: string, storeId: string, client: DbClient = prisma) {
        return client.expense.count({ where: { categoryId: id, storeId } });
    },
};
