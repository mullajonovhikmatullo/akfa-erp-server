import { Prisma } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, branchScope, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { isBranchScopedRole } from "../../../core/utils/role-access";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";
import { CustomersRepository } from "../repositories/customers.repository";
import { z } from "zod";
import { customerQuerySchema } from "../validations/customer.validation";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

// Branch-scoped staff see only the part of a store-wide customer balance that
// belongs to their own branch; store managers keep the full balance.
async function presentBalances<T extends { id: string; balance: Prisma.Decimal }>(
    customers: T[],
    user: JwtPayload,
    client: DbClient = prisma
): Promise<T[]> {
    if (!isBranchScopedRole(user.role)) return customers;
    const { storeId, branchId } = branchScope(user);
    const balances = await CustomersRepository.branchBalances(storeId, branchId!, customers.map((c) => c.id), client);
    return customers.map((customer) => ({ ...customer, balance: balances.get(customer.id) ?? new Prisma.Decimal(0) }));
}

async function presentBalance<T extends { id: string; balance: Prisma.Decimal }>(
    customer: T,
    user: JwtPayload,
    client: DbClient = prisma
): Promise<T> {
    const [presented] = await presentBalances([customer], user, client);
    return presented;
}

export function normalizeCustomerPhone(phone?: string | null) {
    if (!phone) return undefined;
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 9) digits = `998${digits}`;
    return digits ? `+${digits}` : undefined;
}

export const CustomersService = {
    async create(dto: CreateCustomerDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(dto.branchId, user);
        const normalizedPhone = normalizeCustomerPhone(dto.phone);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            await assertBranchInStore(branchId, storeId, tx);
            if (normalizedPhone) {
                const existing = await CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone, tx);
                if (existing) throw new AppError(409, "Bu telefon raqamli mijoz allaqachon mavjud");
            }
            return CustomersRepository.create({
                ...dto,
                phone: normalizedPhone,
                normalizedPhone,
                storeId,
                branchId,
            }, tx);
        }, transactionOptions);
    },

    async checkPhone(phone: string, requestedBranchId: string | undefined, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(requestedBranchId, user);
        await assertBranchInStore(branchId, storeId);
        const normalizedPhone = normalizeCustomerPhone(phone);
        if (!normalizedPhone) return { customer: null, linkedToBranch: false, normalizedPhone: null };
        const customer = await CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone);
        const linkedToBranch = Boolean(customer?.branchLinks.some((link) => link.branchId === branchId));
        if (!customer || !isBranchScopedRole(user.role)) return { customer, linkedToBranch, normalizedPhone };
        if (!linkedToBranch) {
            const { id, fullName, phone: customerPhone, branch } = customer;
            return { customer: { id, fullName, phone: customerPhone, branch }, linkedToBranch, normalizedPhone };
        }
        return { customer: await presentBalance(customer, user), linkedToBranch, normalizedPhone };
    },

    async linkBranch(id: string, requestedBranchId: string | undefined, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(requestedBranchId, user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            await assertBranchInStore(branchId, storeId, tx);
            const customer = await CustomersRepository.findById(id, storeId, tx);
            if (!customer) throw new AppError(404, "Customer not found");
            await CustomersRepository.linkBranch(customer.id, storeId, branchId, tx);
            const linked = await CustomersRepository.findById(customer.id, storeId, tx);
            return linked && presentBalance(linked, user, tx);
        }, transactionOptions);
    },

    async findAll(query: z.infer<typeof customerQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);
        const branchDebtorIds = query.hasDebt && isBranchScopedRole(user.role)
            ? await CustomersRepository.findBranchDebtorIds(scope.storeId, scope.branchId!)
            : undefined;
        const customers = await CustomersRepository.findAll({
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

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const customer = await CustomersRepository.findById(id, storeId);
        if (!customer) throw new AppError(404, "Customer not found");

        // Branch isolation: ADMIN can only view customers in their branch
        if (isBranchScopedRole(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
            throw new AppError(403, "Forbidden");
        }

        const recentSales = await CustomersRepository.recentSales(id, storeId, 10, branchScope(user).branchId);
        return { ...await presentBalance(customer, user), recentSales };
    },

    async update(id: string, dto: UpdateCustomerDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const customer = await CustomersRepository.findById(id, storeId, tx);
            if (!customer) throw new AppError(404, "Customer not found");

            if (isBranchScopedRole(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
                throw new AppError(403, "Forbidden");
            }

            const normalizedPhone = dto.phone === undefined ? undefined : normalizeCustomerPhone(dto.phone);
            if (normalizedPhone) {
                const duplicate = await CustomersRepository.findByNormalizedPhone(storeId, normalizedPhone, tx);
                if (duplicate && duplicate.id !== id) throw new AppError(409, "Bu telefon raqamli mijoz allaqachon mavjud");
            }
            const updated = await CustomersRepository.update(id, storeId, {
                ...dto,
                ...(dto.phone !== undefined ? { phone: normalizedPhone, normalizedPhone } : {}),
            }, tx);
            return presentBalance(updated, user, tx);
        }, transactionOptions);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const customer = await CustomersRepository.findById(id, storeId, tx);
            if (!customer) throw new AppError(404, "Customer not found");

            if (isBranchScopedRole(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
                throw new AppError(403, "Forbidden");
            }

            if (Number(customer.balance) > 0) {
                throw new AppError(
                    409,
                    `Cannot delete customer with outstanding debt of ${customer.balance} UZS`
                );
            }

            const deactivated = await CustomersRepository.update(id, storeId, { isActive: false }, tx);
            return presentBalance(deactivated, user, tx);
        }, transactionOptions);
    },
};
