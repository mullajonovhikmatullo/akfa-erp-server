"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesRepository = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
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
};
exports.ExpensesRepository = {
    create(data) {
        return prisma_1.prisma.expense.create({
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
    findAll(filters) {
        return prisma_1.prisma.expense.findMany({
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
    categorySummary(filters) {
        const branchCond = filters.branchId
            ? client_1.Prisma.sql `AND e."branchId" = ${filters.branchId}`
            : client_1.Prisma.empty;
        const storeCond = client_1.Prisma.sql `AND e."storeId" = ${filters.storeId}`;
        const categoryCond = filters.categoryId
            ? client_1.Prisma.sql `AND e."categoryId" = ${filters.categoryId}`
            : client_1.Prisma.empty;
        const fromCond = filters.from
            ? client_1.Prisma.sql `AND e."expenseDate" >= ${new Date(filters.from)}`
            : client_1.Prisma.empty;
        const toCond = filters.to
            ? client_1.Prisma.sql `AND e."expenseDate" <= ${new Date(filters.to)}`
            : client_1.Prisma.empty;
        return prisma_1.prisma.$queryRaw `
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
    findById(id, storeId) {
        return prisma_1.prisma.expense.findFirst({ where: { id, storeId }, select: expenseSelect });
    },
    delete(id) {
        return prisma_1.prisma.expense.delete({ where: { id } });
    },
    sumByBranchAndPeriod(storeId, branchId, from, to) {
        return prisma_1.prisma.expense.aggregate({
            where: {
                storeId,
                branchId,
                expenseDate: { gte: from, lte: to },
            },
            _sum: { amount: true },
        });
    },
};
