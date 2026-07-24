"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryRepository = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
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
};
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
};
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
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildBatchWhere(filters) {
    return {
        storeId: filters.storeId,
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.productId && { productId: filters.productId }),
        ...(filters.depleted === false && { remainingQty: { gt: 0 } }),
        ...(filters.depleted === true && { remainingQty: { equals: 0 } }),
        ...((filters.from || filters.to) && {
            receivedAt: {
                ...(filters.from && { gte: new Date(filters.from) }),
                ...(filters.to && { lte: new Date(filters.to) }),
            },
        }),
    };
}
exports.InventoryRepository = {
    findAll(filters) {
        return prisma_1.prisma.inventory.findMany({
            where: {
                storeId: filters.storeId,
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
    findOne(storeId, branchId, productId, tx) {
        const client = tx ?? prisma_1.prisma;
        return client.inventory.findFirst({
            where: { storeId, branchId, productId },
            select: inventorySelect,
        });
    },
    // Atomically increment or decrement the running balance.
    // delta > 0 = stock in, delta < 0 = stock out / adjustment.
    upsertBalance(storeId, branchId, productId, delta, tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { storeId, branchId, productId, quantity: delta },
            update: { quantity: { increment: delta } },
            select: { quantity: true },
        });
    },
    setBalance(storeId, branchId, productId, quantity, tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { storeId, branchId, productId, quantity },
            update: { quantity },
            select: { quantity: true },
        });
    },
    // ─── StockBatch ──────────────────────────────────────────────────────────
    createBatch(data, tx) {
        return tx.stockBatch.create({ data, select: batchSelect });
    },
    findBatchesByIds(ids, tx) {
        return tx.stockBatch.findMany({
            where: { id: { in: ids } },
            select: batchSelect,
        });
    },
    incrementBalances(rows, tx) {
        if (rows.length === 0)
            return Promise.resolve([]);
        const values = client_1.Prisma.join(rows.map((row) => client_1.Prisma.sql `(${(0, crypto_1.randomUUID)()}, ${row.storeId}, ${row.branchId}, ${row.productId}, ${row.quantity}, NOW())`));
        return tx.$queryRaw(client_1.Prisma.sql `
                INSERT INTO "Inventory" ("id", "storeId", "branchId", "productId", "quantity", "updatedAt")
                VALUES ${values}
                ON CONFLICT ("branchId", "productId")
                DO UPDATE SET
                    "quantity" = "Inventory"."quantity" + EXCLUDED."quantity",
                    "updatedAt" = NOW()
                RETURNING "storeId", "branchId", "productId", "quantity"
            `);
    },
    // Returns batches ordered oldest-first (FIFO) with remaining stock > 0
    findActiveBatches(storeId, branchId, productId, tx) {
        return tx.stockBatch.findMany({
            where: {
                storeId,
                branchId,
                productId,
                remainingQty: { gt: 0 },
            },
            orderBy: { receivedAt: "asc" },
            select: { id: true, remainingQty: true },
        });
    },
    async sumRemainingQty(storeId, branchId, productId, tx) {
        const result = await tx.stockBatch.aggregate({
            where: { storeId, branchId, productId },
            _sum: { remainingQty: true },
        });
        return Number(result._sum.remainingQty ?? 0);
    },
    decrementBatch(id, amount, tx) {
        return tx.stockBatch.update({
            where: { id },
            data: { remainingQty: { decrement: amount } },
        });
    },
    findBatches(filters, tx) {
        const client = tx ?? prisma_1.prisma;
        return client.stockBatch.findMany({
            where: buildBatchWhere(filters),
            select: batchSelect,
            orderBy: { receivedAt: "desc" },
        });
    },
    findBatchesPaginated(filters, page, pageSize) {
        return prisma_1.prisma.stockBatch.findMany({
            where: buildBatchWhere(filters),
            select: batchSelect,
            orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    countBatches(filters) {
        return prisma_1.prisma.stockBatch.count({ where: buildBatchWhere(filters) });
    },
    async sumBatchCostUzs(storeId, branchId) {
        const rows = await prisma_1.prisma.$queryRaw(branchId
            ? client_1.Prisma.sql `SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId} AND "branchId" = ${branchId}`
            : client_1.Prisma.sql `SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId}`);
        return Number(rows[0].total);
    },
    async sumRemainingValueUzs(storeId, branchId) {
        const rows = await prisma_1.prisma.$queryRaw(branchId
            ? client_1.Prisma.sql `SELECT COALESCE(SUM("remainingQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId} AND "branchId" = ${branchId}`
            : client_1.Prisma.sql `SELECT COALESCE(SUM("remainingQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId}`);
        return Number(rows[0].total);
    },
    // ─── StockMovement ───────────────────────────────────────────────────────
    createMovement(data, tx) {
        return tx.stockMovement.create({ data, select: movementSelect });
    },
    findMovements(filters) {
        return prisma_1.prisma.stockMovement.findMany({
            where: {
                storeId: filters.storeId,
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
