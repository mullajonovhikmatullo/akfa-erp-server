import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope } from "../../../core/utils/branch-access";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateExpenseDto } from "../dto/create-expense.dto";
import { ExpensesRepository } from "../repositories/expenses.repository";
import {
    expenseCategorySummaryQuerySchema,
    expenseQuerySchema,
} from "../validations/expense.validation";

export const ExpensesService = {
    async create(dto: CreateExpenseDto, user: JwtPayload) {
        if (!user.branchId) {
            throw new AppError(403, "Your account is not assigned to any branch");
        }
        const branchId = user.branchId;

        const category = await prisma.expenseCategory.findUnique({
            where: { id: dto.categoryId },
        });
        if (!category) throw new AppError(404, "Expense category not found");
        if (!category.isActive) throw new AppError(409, "Expense category is inactive");

        return ExpensesRepository.create({ ...dto, branchId, createdById: user.id });
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
        const expense = await ExpensesRepository.findById(id);
        if (!expense) throw new AppError(404, "Expense not found");

        if (user.role === "ADMIN" && expense.branch.id !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        return expense;
    },

    async delete(id: string, user: JwtPayload) {
        const expense = await ExpensesRepository.findById(id);
        if (!expense) throw new AppError(404, "Expense not found");

        if (user.role === "ADMIN") {
            if (expense.branch.id !== user.branchId) {
                throw new AppError(403, "Forbidden");
            }
            const ageHours =
                (Date.now() - new Date(expense.createdAt).getTime()) / 1000 / 3600;
            if (ageHours > 24) {
                throw new AppError(
                    403,
                    "Expenses older than 24 hours can only be deleted by SUPER_ADMIN"
                );
            }
        }

        return ExpensesRepository.delete(id);
    },
};
