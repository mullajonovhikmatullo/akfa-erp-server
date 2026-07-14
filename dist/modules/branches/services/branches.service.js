"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesService = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
class BranchesService {
    static async create(data) {
        return prisma_1.prisma.branch.create({
            data,
        });
    }
    static async findAll() {
        return prisma_1.prisma.branch.findMany({
            orderBy: { createdAt: "desc" },
        });
    }
    static async findPaginated({ page, pageSize }) {
        const [items, total] = await Promise.all([
            prisma_1.prisma.branch.findMany({
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma_1.prisma.branch.count(),
        ]);
        return { items, total };
    }
    static async update(id, data) {
        return prisma_1.prisma.branch.update({
            where: { id },
            data,
        });
    }
    static async delete(id) {
        return prisma_1.prisma.branch.delete({
            where: { id },
        });
    }
}
exports.BranchesService = BranchesService;
