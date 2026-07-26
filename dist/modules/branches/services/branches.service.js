"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesService = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const branch_access_1 = require("../../../core/utils/branch-access");
const AppError_1 = require("../../../core/errors/AppError");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
class BranchesService {
    static async create(data, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.assertPlanCapacity)(tx, storeId, "branches");
            return tx.branch.create({
                data: {
                    name: data.name,
                    address: data.address,
                    phone: data.phone,
                    storeId,
                },
            });
        }, prisma_1.transactionOptions);
    }
    static async findAll(user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.branch.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
        });
    }
    static async findPaginated({ page, pageSize, user }) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const [items, total] = await Promise.all([
            prisma_1.prisma.branch.findMany({
                where: { storeId },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma_1.prisma.branch.count({ where: { storeId } }),
        ]);
        return { items, total };
    }
    static async update(id, data, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const branch = await tx.branch.findFirst({
                where: { id, storeId },
                select: { id: true },
            });
            if (!branch)
                throw new AppError_1.AppError(404, "Branch not found");
            return tx.branch.update({
                where: { id, storeId },
                data: {
                    name: data.name,
                    address: data.address,
                    phone: data.phone,
                },
            });
        }, prisma_1.transactionOptions);
    }
    static async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const branch = await tx.branch.findFirst({
                where: { id, storeId },
                select: { id: true },
            });
            if (!branch)
                throw new AppError_1.AppError(404, "Branch not found");
            return tx.branch.delete({
                where: { id, storeId },
            });
        }, prisma_1.transactionOptions);
    }
}
exports.BranchesService = BranchesService;
