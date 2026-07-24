"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransfersRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const transferItemSelect = {
    id: true,
    quantity: true,
    unitCostUzs: true,
    totalCostUzs: true,
    product: { select: { id: true, name: true, sku: true, unit: true } },
};
const transferSelect = {
    id: true,
    storeId: true,
    status: true,
    note: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
    fromBranch: { select: { id: true, name: true } },
    toBranch: { select: { id: true, name: true } },
    initiatedBy: { select: { id: true, fullName: true } },
    completedBy: { select: { id: true, fullName: true } },
    items: { select: transferItemSelect },
};
exports.TransfersRepository = {
    create(data) {
        return prisma_1.prisma.transfer.create({
            data: {
                storeId: data.storeId,
                fromBranchId: data.fromBranchId,
                toBranchId: data.toBranchId,
                note: data.note,
                initiatedById: data.initiatedById,
                items: {
                    createMany: { data: data.items },
                },
            },
            select: transferSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.transfer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && {
                    OR: [
                        { fromBranchId: filters.branchId },
                        { toBranchId: filters.branchId },
                    ],
                }),
                ...(filters.status && { status: filters.status }),
                ...((filters.from || filters.to) && {
                    createdAt: {
                        ...(filters.from && { gte: new Date(filters.from) }),
                        ...(filters.to && { lte: new Date(filters.to) }),
                    },
                }),
            },
            select: transferSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },
    findById(id, storeId, tx) {
        const client = tx ?? prisma_1.prisma;
        return client.transfer.findFirst({ where: { id, storeId }, select: transferSelect });
    },
    updateStatus(id, status, completedById, tx) {
        return tx.transfer.update({
            where: { id },
            data: {
                status,
                ...(status === "COMPLETED" && {
                    completedById,
                    completedAt: new Date(),
                }),
            },
            select: transferSelect,
        });
    },
};
