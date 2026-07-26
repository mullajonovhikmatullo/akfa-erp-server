"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseCategoriesService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const expense_categories_repository_1 = require("../repositories/expense-categories.repository");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.ExpenseCategoriesService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const existing = await expense_categories_repository_1.ExpenseCategoriesRepository.findByName(dto.name, storeId, tx);
            if (existing)
                throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
            return expense_categories_repository_1.ExpenseCategoriesRepository.create({ ...dto, storeId }, tx);
        }, prisma_1.transactionOptions);
    },
    findAll(includeInactive, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return expense_categories_repository_1.ExpenseCategoriesRepository.findAll(storeId, includeInactive);
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const category = await expense_categories_repository_1.ExpenseCategoriesRepository.findById(id, storeId);
        if (!category)
            throw new AppError_1.AppError(404, "Expense category not found");
        return category;
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const category = await expense_categories_repository_1.ExpenseCategoriesRepository.findById(id, storeId, tx);
            if (!category)
                throw new AppError_1.AppError(404, "Expense category not found");
            if (dto.name && dto.name !== category.name) {
                const conflict = await expense_categories_repository_1.ExpenseCategoriesRepository.findByName(dto.name, storeId, tx);
                if (conflict)
                    throw new AppError_1.AppError(409, `Category "${dto.name}" already exists`);
            }
            return expense_categories_repository_1.ExpenseCategoriesRepository.update(id, storeId, dto, tx);
        }, prisma_1.transactionOptions);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const category = await expense_categories_repository_1.ExpenseCategoriesRepository.findById(id, storeId, tx);
            if (!category)
                throw new AppError_1.AppError(404, "Expense category not found");
            const expenseCount = await expense_categories_repository_1.ExpenseCategoriesRepository.countExpenses(id, storeId, tx);
            if (expenseCount > 0) {
                throw new AppError_1.AppError(409, `Cannot delete: ${expenseCount} expense(s) are linked to this category`);
            }
            return expense_categories_repository_1.ExpenseCategoriesRepository.delete(id, storeId, tx);
        }, prisma_1.transactionOptions);
    },
};
