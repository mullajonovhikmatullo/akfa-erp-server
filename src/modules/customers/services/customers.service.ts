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
        return {
            customer,
            linkedToBranch: Boolean(customer?.branchLinks.some((link) => link.branchId === branchId)),
            normalizedPhone,
        };
    },

    async linkBranch(id: string, requestedBranchId: string | undefined, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(requestedBranchId, user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            await assertBranchInStore(branchId, storeId, tx);
            const customer = await CustomersRepository.findById(id, storeId, tx);
            if (!customer) throw new AppError(404, "Customer not found");
            await CustomersRepository.linkBranch(customer.id, branchId, tx);
            return CustomersRepository.findById(customer.id, storeId, tx);
        }, transactionOptions);
    },

    async findAll(query: z.infer<typeof customerQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);
        return CustomersRepository.findAll({
            ...scope,
            search: query.search,
            isActive: query.isActive,
            hasDebt: query.hasDebt,
        });
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const customer = await CustomersRepository.findById(id, storeId);
        if (!customer) throw new AppError(404, "Customer not found");

        // Branch isolation: ADMIN can only view customers in their branch
        if (isBranchScopedRole(user.role) && !customer.branchLinks.some((link) => link.branchId === user.branchId)) {
            throw new AppError(403, "Forbidden");
        }

        const recentSales = await CustomersRepository.recentSales(id, storeId);
        return { ...customer, recentSales };
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
            return CustomersRepository.update(id, storeId, {
                ...dto,
                ...(dto.phone !== undefined ? { phone: normalizedPhone, normalizedPhone } : {}),
            }, tx);
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

            return CustomersRepository.update(id, storeId, { isActive: false }, tx);
        }, transactionOptions);
    },
};
