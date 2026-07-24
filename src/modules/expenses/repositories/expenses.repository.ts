import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseDto } from "../dto/create-expense.dto";

const expenseSelect = {
    id: true,
    storeId: true,
    category: { select: { id: true, name: true, description: true } },
    amount: true,
    currency: true,
    amountUsd: true,
    usdToUzsRate: true,
    description: true,
    expenseDate: true,
    createdAt: true,
    branch: { select: { id: true, name: true } },
    createdBy: { select: { id: true, fullName: true } },
} as const;

type ExpenseFilters = {
    storeId: string;
    branchId?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    limit: number;
};

type ExpenseCategorySummaryFilters = Omit<ExpenseFilters, "limit">;

export const ExpensesRepository = {
    create(data: Omit<CreateExpenseDto, "branchId"> & { storeId: string; branchId: string; createdById: string }) {
        return prisma.expense.create({
            data: {
                storeId: data.storeId,
                branchId: data.branchId,
                categoryId: data.categoryId,
                amount: data.amount,
                currency: data.currency,
                amountUsd: data.currency === "USD" ? data.amountUsd : 0,
                usdToUzsRate: data.currency === "USD" ? data.usdToUzsRate : null,
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
                storeId: filters.storeId,
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

    categorySummary(filters: ExpenseCategorySummaryFilters) {
        const branchCond = filters.branchId
            ? Prisma.sql`AND e."branchId" = ${filters.branchId}`
            : Prisma.empty;
        const storeCond = Prisma.sql`AND e."storeId" = ${filters.storeId}`;
        const categoryCond = filters.categoryId
            ? Prisma.sql`AND e."categoryId" = ${filters.categoryId}`
            : Prisma.empty;
        const fromCond = filters.from
            ? Prisma.sql`AND e."expenseDate" >= ${new Date(filters.from)}`
            : Prisma.empty;
        const toCond = filters.to
            ? Prisma.sql`AND e."expenseDate" <= ${new Date(filters.to)}`
            : Prisma.empty;

        return prisma.$queryRaw<{
            category_id: string;
            category_name: string;
            total: string;
            count: bigint;
        }[]>`
            SELECT
                ec.id AS category_id,
                ec.name AS category_name,
                SUM(e.amount)::text AS total,
                COUNT(e.id)::bigint AS count
            FROM "Expense" e
            JOIN "ExpenseCategory" ec ON ec.id = e."categoryId"
            WHERE 1 = 1
              ${storeCond}
              ${branchCond}
              ${categoryCond}
              ${fromCond}
              ${toCond}
            GROUP BY ec.id, ec.name
            ORDER BY SUM(e.amount) DESC
        `;
    },

    findById(id: string, storeId: string) {
        return prisma.expense.findFirst({ where: { id, storeId }, select: expenseSelect });
    },

    delete(id: string) {
        return prisma.expense.delete({ where: { id } });
    },

    sumByBranchAndPeriod(storeId: string, branchId: string, from: Date, to: Date) {
        return prisma.expense.aggregate({
            where: {
                storeId,
                branchId,
                expenseDate: { gte: from, lte: to },
            },
            _sum: { amount: true },
        });
    },
};
