"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const branch_access_1 = require("../../../core/utils/branch-access");
const customers_repository_1 = require("../repositories/customers.repository");
exports.CustomersService = {
    async create(dto, user) {
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        return customers_repository_1.CustomersRepository.create({ ...dto, branchId });
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
        const customer = await customers_repository_1.CustomersRepository.findById(id);
        if (!customer)
            throw new AppError_1.AppError(404, "Customer not found");
        // Branch isolation: ADMIN can only view customers in their branch
        if (user.role === "ADMIN" && customer.branchId !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        const recentSales = await customers_repository_1.CustomersRepository.recentSales(id);
        return { ...customer, recentSales };
    },
    async update(id, dto, user) {
        const customer = await customers_repository_1.CustomersRepository.findById(id);
        if (!customer)
            throw new AppError_1.AppError(404, "Customer not found");
        if (user.role === "ADMIN" && customer.branchId !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        return customers_repository_1.CustomersRepository.update(id, dto);
    },
    async delete(id, user) {
        const customer = await customers_repository_1.CustomersRepository.findById(id);
        if (!customer)
            throw new AppError_1.AppError(404, "Customer not found");
        if (user.role === "ADMIN" && customer.branchId !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        if (Number(customer.balance) > 0) {
            throw new AppError_1.AppError(409, `Cannot delete customer with outstanding debt of ${customer.balance} UZS`);
        }
        return customers_repository_1.CustomersRepository.update(id, { isActive: false });
    },
};
