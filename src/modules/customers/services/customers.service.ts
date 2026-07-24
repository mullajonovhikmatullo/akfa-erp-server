import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, branchScope, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { isBranchScopedRole } from "../../../core/utils/role-access";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";
import { CustomersRepository } from "../repositories/customers.repository";
import { z } from "zod";
import { customerQuerySchema } from "../validations/customer.validation";

export const CustomersService = {
    async create(dto: CreateCustomerDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(dto.branchId, user);
        await assertBranchInStore(branchId, storeId);
        return CustomersRepository.create({ ...dto, storeId, branchId });
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
        if (isBranchScopedRole(user.role) && customer.branchId !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        const recentSales = await CustomersRepository.recentSales(id, storeId);
        return { ...customer, recentSales };
    },

    async update(id: string, dto: UpdateCustomerDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const customer = await CustomersRepository.findById(id, storeId);
        if (!customer) throw new AppError(404, "Customer not found");

        if (isBranchScopedRole(user.role) && customer.branchId !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        return CustomersRepository.update(id, dto);
    },

    async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const customer = await CustomersRepository.findById(id, storeId);
        if (!customer) throw new AppError(404, "Customer not found");

        if (isBranchScopedRole(user.role) && customer.branchId !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        if (Number(customer.balance) > 0) {
            throw new AppError(
                409,
                `Cannot delete customer with outstanding debt of ${customer.balance} UZS`
            );
        }

        return CustomersRepository.update(id, { isActive: false });
    },
};
