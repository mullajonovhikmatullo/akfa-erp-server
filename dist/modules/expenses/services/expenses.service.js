"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const branch_access_1 = require("../../../core/utils/branch-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const expenses_repository_1 = require("../repositories/expenses.repository");
exports.ExpensesService = {
    async create(dto, user) {
        if (!user.branchId) {
            throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
        }
        const branchId = user.branchId;
        const category = await prisma_1.prisma.expenseCategory.findUnique({
            where: { id: dto.categoryId },
        });
        if (!category)
            throw new AppError_1.AppError(404, "Expense category not found");
        if (!category.isActive)
            throw new AppError_1.AppError(409, "Expense category is inactive");
        const amount = dto.currency === "USD"
            ? Number((dto.amountUsd * (dto.usdToUzsRate ?? 0)).toFixed(2))
            : dto.amount;
        return expenses_repository_1.ExpensesRepository.create({ ...dto, amount, branchId, createdById: user.id });
    },
    async findAll(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return expenses_repository_1.ExpensesRepository.findAll({
            ...scope,
            categoryId: query.categoryId,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },
    async categorySummary(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const rows = await expenses_repository_1.ExpensesRepository.categorySummary({
            ...scope,
            categoryId: query.categoryId,
            from: query.from,
            to: query.to,
        });
        const categories = rows.map((r) => ({
            categoryId: r.category_id,
            categoryName: r.category_name,
            amount: Number(r.total),
            count: Number(r.count),
        }));
        const total = categories.reduce((sum, c) => sum + c.amount, 0);
        const hasOverflow = categories.length > query.limit;
        const visibleCount = hasOverflow ? Math.max(query.limit - 1, 1) : query.limit;
        const kpiCategories = categories.slice(0, visibleCount);
        if (hasOverflow && query.limit > 1) {
            const otherCategories = categories.slice(visibleCount);
            kpiCategories.push({
                categoryId: "other-expense-categories",
                categoryName: "Other",
                amount: otherCategories.reduce((sum, c) => sum + c.amount, 0),
                count: otherCategories.reduce((sum, c) => sum + c.count, 0),
                isOther: true,
            });
        }
        return {
            total,
            categories,
            kpiCategories,
        };
    },
    async findById(id, user) {
        const expense = await expenses_repository_1.ExpensesRepository.findById(id);
        if (!expense)
            throw new AppError_1.AppError(404, "Expense not found");
        if (user.role === "ADMIN" && expense.branch.id !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        return expense;
    },
    async delete(id, user) {
        const expense = await expenses_repository_1.ExpensesRepository.findById(id);
        if (!expense)
            throw new AppError_1.AppError(404, "Expense not found");
        if (user.role === "ADMIN") {
            if (expense.branch.id !== user.branchId) {
                throw new AppError_1.AppError(403, "Forbidden");
            }
            const ageHours = (Date.now() - new Date(expense.createdAt).getTime()) / 1000 / 3600;
            if (ageHours > 24) {
                throw new AppError_1.AppError(403, "Expenses older than 24 hours can only be deleted by SUPER_ADMIN");
            }
        }
        return expenses_repository_1.ExpensesRepository.delete(id);
    },
};
