import { AppError } from "../../../core/errors/AppError";
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from "../dto/create-expense-category.dto";
import { ExpenseCategoriesRepository } from "../repositories/expense-categories.repository";

export const ExpenseCategoriesService = {
    async create(dto: CreateExpenseCategoryDto) {
        const existing = await ExpenseCategoriesRepository.findByName(dto.name);
        if (existing) throw new AppError(409, `Category "${dto.name}" already exists`);
        return ExpenseCategoriesRepository.create(dto);
    },

    findAll(includeInactive = false) {
        return ExpenseCategoriesRepository.findAll(includeInactive);
    },

    async findById(id: string) {
        const category = await ExpenseCategoriesRepository.findById(id);
        if (!category) throw new AppError(404, "Expense category not found");
        return category;
    },

    async update(id: string, dto: UpdateExpenseCategoryDto) {
        const category = await ExpenseCategoriesRepository.findById(id);
        if (!category) throw new AppError(404, "Expense category not found");

        if (dto.name && dto.name !== category.name) {
            const conflict = await ExpenseCategoriesRepository.findByName(dto.name);
            if (conflict) throw new AppError(409, `Category "${dto.name}" already exists`);
        }

        return ExpenseCategoriesRepository.update(id, dto);
    },

    async delete(id: string) {
        const category = await ExpenseCategoriesRepository.findById(id);
        if (!category) throw new AppError(404, "Expense category not found");

        const expenseCount = await ExpenseCategoriesRepository.countExpenses(id);
        if (expenseCount > 0) {
            throw new AppError(
                409,
                `Cannot delete: ${expenseCount} expense(s) are linked to this category`
            );
        }

        return ExpenseCategoriesRepository.delete(id);
    },
};
