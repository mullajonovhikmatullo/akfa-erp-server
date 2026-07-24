import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, branchScope, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { isBranchScopedRole } from "../../../core/utils/role-access";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseDto } from "../dto/create-expense.dto";
import { ExpensesRepository } from "../repositories/expenses.repository";
import {
    expenseCategorySummaryQuerySchema,
    expenseQuerySchema,
} from "../validations/expense.validation";

export const ExpensesService = {
    async create(dto: CreateExpenseDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(dto.branchId, user);
        await assertBranchInStore(branchId, storeId);

        const category = await prisma.expenseCategory.findFirst({
            where: { id: dto.categoryId, storeId },
        });
        if (!category) throw new AppError(404, "Expense category not found");
        if (!category.isActive) throw new AppError(409, "Expense category is inactive");

        const amount =
            dto.currency === "USD"
                ? Number((dto.amountUsd * (dto.usdToUzsRate ?? 0)).toFixed(2))
                : dto.amount;

        return ExpensesRepository.create({ ...dto, amount, storeId, branchId, createdById: user.id });
    },

    async findAll(query: z.infer<typeof expenseQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);
        return ExpensesRepository.findAll({
            ...scope,
            categoryId: query.categoryId,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },

    async categorySummary(
        query: z.infer<typeof expenseCategorySummaryQuerySchema>,
        user: JwtPayload
    ) {
        const scope = branchScope(user, query.branchId);
        const rows = await ExpensesRepository.categorySummary({
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
        const kpiCategories: Array<{
            categoryId: string;
            categoryName: string;
            amount: number;
            count: number;
            isOther?: boolean;
        }> = categories.slice(0, visibleCount);

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

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const expense = await ExpensesRepository.findById(id, storeId);
        if (!expense) throw new AppError(404, "Expense not found");

        if (isBranchScopedRole(user.role) && expense.branch.id !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        return expense;
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const expense = await ExpensesRepository.findById(id, storeId);
        if (!expense) throw new AppError(404, "Expense not found");

        if (isBranchScopedRole(user.role)) {
            if (expense.branch.id !== user.branchId) {
                throw new AppError(403, "Forbidden");
            }
            const ageHours =
                (Date.now() - new Date(expense.createdAt).getTime()) / 1000 / 3600;
            if (ageHours > 24) {
                throw new AppError(
                    403,
                    "Expenses older than 24 hours can only be deleted by store owner"
                );
            }
        }

        return ExpensesRepository.delete(id);
    },
};
