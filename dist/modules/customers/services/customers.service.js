"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const role_access_1 = require("../../../core/utils/role-access");
const customers_repository_1 = require("../repositories/customers.repository");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.CustomersService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            await (0, branch_access_1.assertBranchInStore)(branchId, storeId, tx);
            return customers_repository_1.CustomersRepository.create({ ...dto, storeId, branchId }, tx);
        }, prisma_1.transactionOptions);
    },
    async findAll(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return customers_repository_1.CustomersRepository.findAll({
            ...scope,
            search: query.search,
            isActive: query.isActive,
            hasDebt: query.hasDebt,
        });
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const customer = await customers_repository_1.CustomersRepository.findById(id, storeId);
        if (!customer)
            throw new AppError_1.AppError(404, "Customer not found");
        // Branch isolation: ADMIN can only view customers in their branch
        if ((0, role_access_1.isBranchScopedRole)(user.role) && customer.branchId !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        const recentSales = await customers_repository_1.CustomersRepository.recentSales(id, storeId);
        return { ...customer, recentSales };
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const customer = await customers_repository_1.CustomersRepository.findById(id, storeId, tx);
            if (!customer)
                throw new AppError_1.AppError(404, "Customer not found");
            if ((0, role_access_1.isBranchScopedRole)(user.role) && customer.branchId !== user.branchId) {
                throw new AppError_1.AppError(403, "Forbidden");
            }
            return customers_repository_1.CustomersRepository.update(id, storeId, dto, tx);
        }, prisma_1.transactionOptions);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const customer = await customers_repository_1.CustomersRepository.findById(id, storeId, tx);
            if (!customer)
                throw new AppError_1.AppError(404, "Customer not found");
            if ((0, role_access_1.isBranchScopedRole)(user.role) && customer.branchId !== user.branchId) {
                throw new AppError_1.AppError(403, "Forbidden");
            }
            if (Number(customer.balance) > 0) {
                throw new AppError_1.AppError(409, `Cannot delete customer with outstanding debt of ${customer.balance} UZS`);
            }
            return customers_repository_1.CustomersRepository.update(id, storeId, { isActive: false }, tx);
        }, prisma_1.transactionOptions);
    },
};
