"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransfersRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const AppError_1 = require("../../../core/errors/AppError");
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
// List rows carry no item lines; the detail endpoint returns them.
const transferSummarySelect = {
    id: true,
    status: true,
    note: true,
    completedAt: true,
    createdAt: true,
    fromBranch: { select: { id: true, name: true } },
    toBranch: { select: { id: true, name: true } },
    initiatedBy: { select: { id: true, fullName: true } },
    _count: { select: { items: true } },
};
function transferWhere(filters) {
    return {
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
    };
}
exports.TransfersRepository = {
    async claimPending(id, storeId, status, tx) {
        const changed = await tx.transfer.updateMany({
            where: { id, storeId, status: "PENDING" },
            data: { status },
        });
        if (changed.count !== 1)
            throw new AppError_1.AppError(409, "Transfer has already been processed");
    },
    create(data, tx) {
        return tx.transfer.create({
            data: {
                storeId: data.storeId,
                fromBranchId: data.fromBranchId,
                toBranchId: data.toBranchId,
                note: data.note,
                initiatedById: data.initiatedById,
                items: {
                    createMany: { data: data.items.map((item) => ({ ...item, storeId: data.storeId })) },
                },
            },
            select: transferSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.transfer.findMany({
            where: transferWhere(filters),
            select: transferSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },
    async findSummaryPage(filters, page, pageSize) {
        const where = transferWhere(filters);
        const [rows, total, pendingCount] = await Promise.all([
            prisma_1.prisma.transfer.findMany({
                where,
                select: transferSummarySelect,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: pageSize,
                skip: (page - 1) * pageSize,
            }),
            prisma_1.prisma.transfer.count({ where }),
            prisma_1.prisma.transfer.count({ where: transferWhere({ ...filters, status: "PENDING" }) }),
        ]);
        const sums = rows.length
            ? await prisma_1.prisma.transferItem.groupBy({
                by: ["transferId"],
                where: { storeId: filters.storeId, transferId: { in: rows.map((row) => row.id) } },
                _sum: { totalCostUzs: true },
            })
            : [];
        const totalById = new Map(sums.map((sum) => [sum.transferId, Number(sum._sum.totalCostUzs ?? 0)]));
        const items = rows.map(({ _count, ...row }) => ({
            ...row,
            itemCount: _count.items,
            totalCostUzs: totalById.get(row.id) ?? 0,
        }));
        return { items, total, pendingCount };
    },
    findById(id, storeId, tx) {
        const client = tx ?? prisma_1.prisma;
        return client.transfer.findFirst({ where: { id, storeId }, select: transferSelect });
    },
    updateStatus(id, storeId, status, completedById, tx) {
        return tx.transfer.update({
            where: { id, storeId },
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
