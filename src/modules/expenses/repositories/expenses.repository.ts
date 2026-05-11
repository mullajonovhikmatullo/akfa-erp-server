import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseDto } from "../dto/create-expense.dto";

const expenseSelect = {
    id: true,
    category: { select: { id: true, name: true, description: true } },
    amount: true,
    description: true,
    expenseDate: true,
    createdAt: true,
    branch: { select: { id: true, name: true } },
    createdBy: { select: { id: true, fullName: true } },
} as const;

type ExpenseFilters = {
    branchId?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    limit: number;
};

export const ExpensesRepository = {
    create(data: Omit<CreateExpenseDto, "branchId"> & { branchId: string; createdById: string }) {
        return prisma.expense.create({
            data: {
                branchId: data.branchId,
                categoryId: data.categoryId,
                amount: data.amount,
                description: data.description,
                expenseDate: new Date(data.expenseDate),
                createdById: data.createdById,
            },
            select: expenseSelect,
        });
    },

    findAll(filters: ExpenseFilters) {
        return prisma.expense.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.categoryId && { categoryId: filters.categoryId }),
                ...((filters.from || filters.to) && {
                    expenseDate: {
                        ...(filters.from && { gte: new Date(filters.from) }),
                        ...(filters.to && { lte: new Date(filters.to) }),
                    },
                }),
            },
            select: expenseSelect,
            orderBy: { expenseDate: "desc" },
            take: filters.limit,
        });
    },

    findById(id: string) {
        return prisma.expense.findUnique({ where: { id }, select: expenseSelect });
    },

    delete(id: string) {
        return prisma.expense.delete({ where: { id } });
    },

    sumByBranchAndPeriod(branchId: string, from: Date, to: Date) {
        return prisma.expense.aggregate({
            where: {
                branchId,
                expenseDate: { gte: from, lte: to },
            },
            _sum: { amount: true },
        });
    },
};
