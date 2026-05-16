import { prisma } from "../../../infrastructure/prisma/prisma";

import { CreateBranchDto } from "../dto/create-branch.dto";

export class BranchesService {
    static async create(data: CreateBranchDto) {
        return prisma.branch.create({
            data,
        });
    }

    static async findAll() {
        return prisma.branch.findMany({
            orderBy: { createdAt: "desc" },
        });
    }

    static async findPaginated({ page, pageSize }: { page: number; pageSize: number }) {
        const [items, total] = await Promise.all([
            prisma.branch.findMany({
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.branch.count(),
        ]);
        return { items, total };
    }

    static async update(id: string, data: Partial<CreateBranchDto>) {
        return prisma.branch.update({
            where: { id },
            data,
        });
    }

    static async delete(id: string) {
        return prisma.branch.delete({
            where: { id },
        });
    }
}
