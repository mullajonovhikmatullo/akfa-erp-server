"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesService = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const branch_access_1 = require("../../../core/utils/branch-access");
const AppError_1 = require("../../../core/errors/AppError");
class BranchesService {
    static async create(data, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.branch.create({
            data: { ...data, storeId },
        });
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
        const branch = await prisma_1.prisma.branch.findFirst({ where: { id, storeId }, select: { id: true } });
        if (!branch)
            throw new AppError_1.AppError(404, "Branch not found");
        return prisma_1.prisma.branch.update({
            where: { id },
            data,
        });
    }
    static async delete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branch = await prisma_1.prisma.branch.findFirst({ where: { id, storeId }, select: { id: true } });
        if (!branch)
            throw new AppError_1.AppError(404, "Branch not found");
        return prisma_1.prisma.branch.delete({
            where: { id },
        });
    }
}
exports.BranchesService = BranchesService;
