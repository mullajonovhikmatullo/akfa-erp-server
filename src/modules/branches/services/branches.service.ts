import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";

import { CreateBranchDto } from "../dto/create-branch.dto";
import { UpdateBranchDto } from "../dto/update-branch.dto";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { AppError } from "../../../core/errors/AppError";
import { assertPlanCapacity } from "../../../core/services/plan-limit.service";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";

export class BranchesService {
    static async create(data: CreateBranchDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertPlanCapacity(tx, storeId, "branches");
            return tx.branch.create({
                data: {
                    name: data.name,
                    address: data.address,
                    phone: data.phone,
                    storeId,
                },
            });
        }, transactionOptions);
    }

    static async findAll(user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.branch.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
        });
    }

    static async findPaginated({ page, pageSize, user }: { page: number; pageSize: number; user: JwtPayload }) {
        const storeId = requireStoreId(user);
        const [items, total] = await Promise.all([
            prisma.branch.findMany({
                where: { storeId },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.branch.count({ where: { storeId } }),
        ]);
        return { items, total };
    }

    static async update(id: string, data: UpdateBranchDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const branch = await tx.branch.findFirst({
                where: { id, storeId },
                select: { id: true },
            });
            if (!branch) throw new AppError(404, "Branch not found");

            return tx.branch.update({
                where: { id, storeId },
                data: {
                    name: data.name,
                    address: data.address,
                    phone: data.phone,
                },
            });
        }, transactionOptions);
    }

    static async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const branch = await tx.branch.findFirst({
                where: { id, storeId },
                select: { id: true },
            });
            if (!branch) throw new AppError(404, "Branch not found");

            return tx.branch.delete({
                where: { id, storeId },
            });
        }, transactionOptions);
    }
}
