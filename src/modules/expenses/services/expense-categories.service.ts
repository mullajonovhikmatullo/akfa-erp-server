import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from "../dto/create-expense-category.dto";
import { ExpenseCategoriesRepository } from "../repositories/expense-categories.repository";

export const ExpenseCategoriesService = {
    async create(dto: CreateExpenseCategoryDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const existing = await ExpenseCategoriesRepository.findByName(dto.name, storeId);
        if (existing) throw new AppError(409, `Category "${dto.name}" already exists`);
        return ExpenseCategoriesRepository.create({ ...dto, storeId });
    },

    findAll(includeInactive: boolean | undefined, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return ExpenseCategoriesRepository.findAll(storeId, includeInactive);
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const category = await ExpenseCategoriesRepository.findById(id, storeId);
        if (!category) throw new AppError(404, "Expense category not found");
        return category;
    },

    async update(id: string, dto: UpdateExpenseCategoryDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const category = await ExpenseCategoriesRepository.findById(id, storeId);
        if (!category) throw new AppError(404, "Expense category not found");

        if (dto.name && dto.name !== category.name) {
            const conflict = await ExpenseCategoriesRepository.findByName(dto.name, storeId);
            if (conflict) throw new AppError(409, `Category "${dto.name}" already exists`);
        }

        return ExpenseCategoriesRepository.update(id, dto);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const category = await ExpenseCategoriesRepository.findById(id, storeId);
        if (!category) throw new AppError(404, "Expense category not found");

        const expenseCount = await ExpenseCategoriesRepository.countExpenses(id, storeId);
        if (expenseCount > 0) {
            throw new AppError(
                409,
                `Cannot delete: ${expenseCount} expense(s) are linked to this category`
            );
        }

        return ExpenseCategoriesRepository.delete(id);
    },
};
