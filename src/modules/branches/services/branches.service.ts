import { prisma } from "../../../infrastructure/prisma/prisma";

import { CreateBranchDto } from "../dto/create-branch.dto";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { AppError } from "../../../core/errors/AppError";

export class BranchesService {
    static async create(data: CreateBranchDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        return prisma.branch.create({
            data: { ...data, storeId },
        });
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

    static async update(id: string, data: Partial<CreateBranchDto>, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branch = await prisma.branch.findFirst({ where: { id, storeId }, select: { id: true } });
        if (!branch) throw new AppError(404, "Branch not found");

        return prisma.branch.update({
            where: { id },
            data,
        });
    }

    static async delete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const branch = await prisma.branch.findFirst({ where: { id, storeId }, select: { id: true } });
        if (!branch) throw new AppError(404, "Branch not found");

        return prisma.branch.delete({
            where: { id },
        });
    }
}
