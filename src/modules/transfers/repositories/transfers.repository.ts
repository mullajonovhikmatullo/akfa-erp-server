import { Prisma, TransferStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";

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

type CreateTransferData = {
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
    branchId?: string;
    status?: TransferStatus;
    from?: string;
    to?: string;
    limit: number;
};

export const TransfersRepository = {
    create(data: CreateTransferData) {
        return prisma.transfer.create({
            data: {
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

    findAll(filters: TransferFilters) {
        return prisma.transfer.findMany({
            where: {
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

    findById(id: string, tx?: Tx) {
        const client = tx ?? prisma;
        return client.transfer.findUnique({ where: { id }, select: transferSelect });
    },

    updateStatus(
        id: string,
        status: TransferStatus,
        completedById: string | null,
        tx: Tx
    ) {
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
