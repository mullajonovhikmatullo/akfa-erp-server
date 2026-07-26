"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const adminSelect = {
    id: true,
    storeId: true,
    fullName: true,
    username: true,
    role: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
};
const STORE_ADMIN_ROLES = ["ADMIN", "BRANCH_ADMIN", "STORE_ADMIN", "CASHIER"];
exports.AdminsRepository = {
    create(data, client = prisma_1.prisma) {
        return client.user.create({
            data: { ...data, role: "BRANCH_ADMIN" },
            select: adminSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.user.findMany({
            where: {
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
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
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
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
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
        });
    },
    countAssigned(storeId) {
        return prisma_1.prisma.user.count({ where: { storeId, role: { in: [...STORE_ADMIN_ROLES] }, branchId: { not: null } } });
    },
    countUnassigned(storeId) {
        return prisma_1.prisma.user.count({ where: { storeId, role: { in: [...STORE_ADMIN_ROLES] }, branchId: null } });
    },
    findById(id, storeId, client = prisma_1.prisma) {
        return client.user.findFirst({
            where: { id, storeId, role: { in: [...STORE_ADMIN_ROLES] } },
            select: adminSelect,
        });
    },
    findByUsername(username, client = prisma_1.prisma) {
        return client.user.findUnique({
            where: { username },
            select: { id: true },
        });
    },
    update(id, storeId, data, client = prisma_1.prisma) {
        return client.user.update({
            where: { id, storeId },
            data,
            select: adminSelect,
        });
    },
};
