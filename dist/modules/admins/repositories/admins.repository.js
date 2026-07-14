"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const adminSelect = {
    id: true,
    fullName: true,
    username: true,
    role: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
};
exports.AdminsRepository = {
    create(data) {
        return prisma_1.prisma.user.create({
            data: { ...data, role: "ADMIN" },
            select: adminSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.user.findMany({
            where: {
                role: "ADMIN",
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
            select: adminSelect,
            orderBy: { createdAt: "desc" },
        });
    },
    findPaginated(filters, page, pageSize) {
        return prisma_1.prisma.user.findMany({
            where: {
                role: "ADMIN",
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
            select: adminSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(filters) {
        return prisma_1.prisma.user.count({
            where: {
                role: "ADMIN",
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
        });
    },
    countAssigned() {
        return prisma_1.prisma.user.count({ where: { role: "ADMIN", branchId: { not: null } } });
    },
    countUnassigned() {
        return prisma_1.prisma.user.count({ where: { role: "ADMIN", branchId: null } });
    },
    findById(id) {
        return prisma_1.prisma.user.findFirst({
            where: { id, role: "ADMIN" },
            select: adminSelect,
        });
    },
    findByUsername(username) {
        return prisma_1.prisma.user.findUnique({
            where: { username },
            select: { id: true },
        });
    },
    update(id, data) {
        return prisma_1.prisma.user.update({
            where: { id },
            data,
            select: adminSelect,
        });
    },
    delete(id) {
        return prisma_1.prisma.user.delete({ where: { id } });
    },
};
