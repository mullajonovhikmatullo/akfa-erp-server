"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
exports.normalizeCustomerPhone = normalizeCustomerPhone;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const role_access_1 = require("../../../core/utils/role-access");
const customers_repository_1 = require("../repositories/customers.repository");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
// Branch-scoped staff see only the part of a store-wide customer balance that
// belongs to their own branch; store managers keep the full balance.
async function presentBalances(customers, user, client = prisma_1.prisma) {
    if (!(0, role_access_1.isBranchScopedRole)(user.role))
        return customers;
    const { storeId, branchId } = (0, branch_access_1.branchScope)(user);
    const balances = await customers_repository_1.CustomersRepository.branchBalances(storeId, branchId, customers.map((c) => c.id), client);
    return customers.map((customer) => ({ ...customer, balance: balances.get(customer.id) ?? new client_1.Prisma.Decimal(0) }));
}
async function presentBalance(customer, user, client = prisma_1.prisma) {
    const [presented] = await presentBalances([customer], user, client);
    return presented;
}
function normalizeCustomerPhone(phone) {
    if (!phone)
        return undefined;
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("00"))
        digits = digits.slice(2);
    if (digits.length === 9)
        digits = `998${digits}`;
    return digits ? `+${digits}` : undefined;
}
exports.CustomersService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        const normalizedPhone = normalizeCustomerPhone(dto.phone);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            await (0, branch_access_1.assertBranchInStore)(branchId, storeId, tx);
            if (normalizedPhone) {
                const existing = await customers_repository_1.CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone, tx);
                if (existing)
                    throw new AppError_1.AppError(409, "Bu telefon raqamli mijoz allaqachon mavjud");
            }
            return customers_repository_1.CustomersRepository.create({
                ...dto,
                phone: normalizedPhone,
                normalizedPhone,
                storeId,
                branchId,
            }, tx);
        }, prisma_1.transactionOptions);
    },
    async checkPhone(phone, requestedBranchId, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(requestedBranchId, user);
        await (0, branch_access_1.assertBranchInStore)(branchId, storeId);
        const normalizedPhone = normalizeCustomerPhone(phone);
        if (!normalizedPhone)
            return { customer: null, linkedToBranch: false, normalizedPhone: null };
        const customer = await customers_repository_1.CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone);
        const linkedToBranch = Boolean(customer?.branchLinks.some((link) => link.branchId === branchId));
        if (!customer || !(0, role_access_1.isBranchScopedRole)(user.role))
            return { customer, linkedToBranch, normalizedPhone };
        if (!linkedToBranch) {
            const { id, fullName, phone: customerPhone, branch } = customer;
            return { customer: { id, fullName, phone: customerPhone, branch }, linkedToBranch, normalizedPhone };
        }
        return { customer: await presentBalance(customer, user), linkedToBranch, normalizedPhone };
    },
    async linkBranch(id, requestedBranchId, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(requestedBranchId, user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            await (0, branch_access_1.assertBranchInStore)(branchId, storeId, tx);
            const customer = await customers_repository_1.CustomersRepository.findById(id, storeId, tx);
            if (!customer)
                throw new AppError_1.AppError(404, "Customer not found");
            await customers_repository_1.CustomersRepository.linkBranch(customer.id, storeId, branchId, tx);
            const linked = await customers_repository_1.CustomersRepository.findById(customer.id, storeId, tx);
            return linked && presentBalance(linked, user, tx);
        }, prisma_1.transactionOptions);
    },
    async findAll(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const branchDebtorIds = query.hasDebt && (0, role_access_1.isBranchScopedRole)(user.role)
            ? await customers_repository_1.CustomersRepository.findBranchDebtorIds(scope.storeId, scope.branchId)
            : undefined;
        const customers = await customers_repository_1.CustomersRepository.findAll({
            ...scope,
            ids: branchDebtorIds,
            search: query.search,
            isActive: query.isActive,
            hasDebt: query.hasDebt && !branchDebtorIds,
            limit: query.limit,
            offset: query.offset,
        });
        return presentBalances(customers, user);
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const customer = await customers_repository_1.CustomersRepository.findById(id, storeId);
        if (!customer)
            throw new AppError_1.AppError(404, "Customer not found");
        // Branch isolation: ADMIN can only view customers in their branch
        if ((0, role_access_1.isBranchScopedRole)(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        const recentSales = await customers_repository_1.CustomersRepository.recentSales(id, storeId, 10, (0, branch_access_1.branchScope)(user).branchId);
        return { ...await presentBalance(customer, user), recentSales };
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const customer = await customers_repository_1.CustomersRepository.findById(id, storeId, tx);
            if (!customer)
                throw new AppError_1.AppError(404, "Customer not found");
            if ((0, role_access_1.isBranchScopedRole)(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
                throw new AppError_1.AppError(403, "Forbidden");
            }
            const normalizedPhone = dto.phone === undefined ? undefined : normalizeCustomerPhone(dto.phone);
            if (normalizedPhone) {
                const duplicate = await customers_repository_1.CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone, tx);
                if (duplicate && duplicate.id !== id)
                    throw new AppError_1.AppError(409, "Bu telefon raqamli mijoz allaqachon mavjud");
            }
            const updated = await customers_repository_1.CustomersRepository.update(id, storeId, {
                ...dto,
                ...(dto.phone !== undefined ? { phone: normalizedPhone, normalizedPhone } : {}),
            }, tx);
            return presentBalance(updated, user, tx);
        }, prisma_1.transactionOptions);
    },
    async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const customer = await customers_repository_1.CustomersRepository.findById(id, storeId, tx);
            if (!customer)
                throw new AppError_1.AppError(404, "Customer not found");
            if ((0, role_access_1.isBranchScopedRole)(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
                throw new AppError_1.AppError(403, "Forbidden");
            }
            if (Number(customer.balance) > 0) {
                throw new AppError_1.AppError(409, `Cannot delete customer with outstanding debt of ${customer.balance} UZS`);
            }
            const deactivated = await customers_repository_1.CustomersRepository.update(id, storeId, { isActive: false }, tx);
            return presentBalance(deactivated, user, tx);
        }, prisma_1.transactionOptions);
    },
};
