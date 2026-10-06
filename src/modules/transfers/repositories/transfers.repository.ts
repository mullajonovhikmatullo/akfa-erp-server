import { Prisma, TransferStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { AppError } from "../../../core/errors/AppError";

type Tx = Prisma.TransactionClient;

const transferItemSelect = {
    id: true,
    quantity: true,
    unitCostUzs: true,
    totalCostUzs: true,
    product: { select: { id: true, name: true, sku: true, unit: true } },
} as const;

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
} as const;

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
} as const;

type CreateTransferData = {
    storeId: string;
    fromBranchId: string;
    toBranchId: string;
    note?: string;
    initiatedById: string;
    items: {
        productId: string;
        quantity: number;
        unitCostUzs: number;
        totalCostUzs: number;
    }[];
};

type TransferFilters = {
    storeId: string;
    branchId?: string;
    status?: TransferStatus;
    from?: string;
    to?: string;
    limit: number;
};

function transferWhere(filters: Omit<TransferFilters, "limit">): Prisma.TransferWhereInput {
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

export const TransfersRepository = {
    async claimPending(id: string, storeId: string, status: TransferStatus, tx: Tx): Promise<void> {
        const changed = await tx.transfer.updateMany({
            where: { id, storeId, status: "PENDING" },
            data: { status },
        });
        if (changed.count !== 1) throw new AppError(409, "Transfer has already been processed");
    },
    create(data: CreateTransferData, tx: Tx) {
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

    findAll(filters: TransferFilters) {
        return prisma.transfer.findMany({
            where: transferWhere(filters),
            select: transferSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },

    async findSummaryPage(filters: Omit<TransferFilters, "limit">, page: number, pageSize: number) {
        const where = transferWhere(filters);
        const [rows, total, pendingCount] = await Promise.all([
            prisma.transfer.findMany({
                where,
                select: transferSummarySelect,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: pageSize,
                skip: (page - 1) * pageSize,
            }),
            prisma.transfer.count({ where }),
            prisma.transfer.count({ where: transferWhere({ ...filters, status: "PENDING" }) }),
        ]);
        const sums = rows.length
            ? await prisma.transferItem.groupBy({
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

    findById(id: string, storeId: string, tx?: Tx) {
        const client = tx ?? prisma;
        return client.transfer.findFirst({ where: { id, storeId }, select: transferSelect });
    },

    updateStatus(
        id: string,
        storeId: string,
        status: TransferStatus,
        completedById: string | null,
        tx: Tx
    ) {
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
