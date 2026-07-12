import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";

type Tx = Prisma.TransactionClient;

// ─── Selects ─────────────────────────────────────────────────────────────────

const inventorySelect = {
    id: true,
    quantity: true,
    updatedAt: true,
    branch: { select: { id: true, name: true } },
    product: {
        select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            lowStockThreshold: true,
            category: { select: { id: true, name: true } },
        },
    },
} as const;

const movementSelect = {
    id: true,
    type: true,
    quantity: true,
    balanceAfter: true,
    note: true,
    createdAt: true,
    branch: { select: { id: true, name: true } },
    product: { select: { id: true, name: true, sku: true, unit: true } },
    createdBy: { select: { id: true, fullName: true } },
} as const;

const batchSelect = {
    id: true,
    initialQty: true,
    remainingQty: true,
    costPriceUzs: true,
    costPriceUsd: true,
    supplierNote: true,
    receivedAt: true,
    createdAt: true,
    branch: { select: { id: true, name: true } },
    product: { select: { id: true, name: true, sku: true, unit: true } },
    createdBy: { select: { id: true, fullName: true } },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBatchWhere(filters: { branchId?: string; productId?: string; depleted?: boolean }) {
    return {
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.productId && { productId: filters.productId }),
        ...(filters.depleted === false && { remainingQty: { gt: 0 } }),
        ...(filters.depleted === true && { remainingQty: { equals: 0 } }),
    };
}

// ─── Inventory ────────────────────────────────────────────────────────────────

type InventoryFilters = {
    branchId?: string;
    productId?: string;
    categoryId?: string;
    lowStock?: boolean;
};

export const InventoryRepository = {
    findAll(filters: InventoryFilters) {
        return prisma.inventory.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.productId && { productId: filters.productId }),
                ...(filters.categoryId && {
                    product: { categoryId: filters.categoryId },
                }),
                ...(filters.lowStock && {
                    product: { lowStockThreshold: { not: null } },
                    AND: {
                        // quantity <= lowStockThreshold — requires raw or JS filter
                        // handled in service layer after fetch
                    },
                }),
            },
            select: inventorySelect,
            orderBy: { updatedAt: "desc" },
        });
    },

    findOne(branchId: string, productId: string, tx?: Tx) {
        const client = tx ?? prisma;
        return client.inventory.findUnique({
            where: { branchId_productId: { branchId, productId } },
            select: inventorySelect,
        });
    },

    // Atomically increment or decrement the running balance.
    // delta > 0 = stock in, delta < 0 = stock out / adjustment.
    upsertBalance(branchId: string, productId: string, delta: number, tx: Tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { branchId, productId, quantity: delta },
            update: { quantity: { increment: delta } },
            select: { quantity: true },
        });
    },

    setBalance(branchId: string, productId: string, quantity: number, tx: Tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { branchId, productId, quantity },
            update: { quantity },
            select: { quantity: true },
        });
    },

    // ─── StockBatch ──────────────────────────────────────────────────────────

    createBatch(
        data: {
            branchId: string;
            productId: string;
            initialQty: number;
            remainingQty: number;
            costPriceUzs: number;
            costPriceUsd?: number;
            supplierNote?: string;
            createdById: string;
        },
        tx: Tx
    ) {
        return tx.stockBatch.create({ data, select: batchSelect });
    },

    // Returns batches ordered oldest-first (FIFO) with remaining stock > 0
    findActiveBatches(branchId: string, productId: string, tx: Tx) {
        return tx.stockBatch.findMany({
            where: {
                branchId,
                productId,
                remainingQty: { gt: 0 },
            },
            orderBy: { receivedAt: "asc" },
            select: { id: true, remainingQty: true },
        });
    },

    async sumRemainingQty(branchId: string, productId: string, tx: Tx) {
        const result = await tx.stockBatch.aggregate({
            where: { branchId, productId },
            _sum: { remainingQty: true },
        });
        return Number(result._sum.remainingQty ?? 0);
    },

    decrementBatch(id: string, amount: number, tx: Tx) {
        return tx.stockBatch.update({
            where: { id },
            data: { remainingQty: { decrement: amount } },
        });
    },

    findBatches(
        filters: { branchId?: string; productId?: string; depleted?: boolean },
        tx?: Tx
    ) {
        const client = tx ?? prisma;
        return client.stockBatch.findMany({
            where: buildBatchWhere(filters),
            select: batchSelect,
            orderBy: { receivedAt: "desc" },
        });
    },

    findBatchesPaginated(
        filters: { branchId?: string; productId?: string; depleted?: boolean },
        page: number,
        pageSize: number
    ) {
        return prisma.stockBatch.findMany({
            where: buildBatchWhere(filters),
            select: batchSelect,
            orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },

    countBatches(filters: { branchId?: string; productId?: string; depleted?: boolean }) {
        return prisma.stockBatch.count({ where: buildBatchWhere(filters) });
    },

    async sumBatchCostUzs(branchId?: string): Promise<number> {
        const rows = await prisma.$queryRaw<[{ total: unknown }]>(
            branchId
                ? Prisma.sql`SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "branchId" = ${branchId}`
                : Prisma.sql`SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch"`
        );
        return Number(rows[0].total);
    },

    // ─── StockMovement ───────────────────────────────────────────────────────

    createMovement(
        data: {
            branchId: string;
            productId: string;
            type: StockMovementType;
            quantity: number;
            balanceAfter: number;
            note?: string;
            createdById: string;
        },
        tx: Tx
    ) {
        return tx.stockMovement.create({ data, select: movementSelect });
    },

    findMovements(filters: {
        branchId?: string;
        productId?: string;
        type?: StockMovementType;
        from?: string;
        to?: string;
        limit: number;
    }) {
        return prisma.stockMovement.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.productId && { productId: filters.productId }),
                ...(filters.type && { type: filters.type }),
                ...((filters.from || filters.to) && {
                    createdAt: {
                        ...(filters.from && { gte: new Date(filters.from) }),
                        ...(filters.to && { lte: new Date(filters.to) }),
                    },
                }),
            },
            select: movementSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },
};
