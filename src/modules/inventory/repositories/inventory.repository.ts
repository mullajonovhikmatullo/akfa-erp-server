import { Prisma, StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
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
    receiptId: true,
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

function buildBatchWhere(filters: {
    storeId: string;
    branchId?: string;
    productId?: string;
    depleted?: boolean;
    from?: string;
    to?: string;
}) {
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

// ─── Inventory ────────────────────────────────────────────────────────────────

type InventoryFilters = {
    storeId: string;
    branchId?: string;
    productId?: string;
    categoryId?: string;
    lowStock?: boolean;
};

export const InventoryRepository = {
    findAll(filters: InventoryFilters) {
        return prisma.inventory.findMany({
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

    findOne(storeId: string, branchId: string, productId: string, tx?: Tx) {
        const client = tx ?? prisma;
        return client.inventory.findFirst({
            where: { storeId, branchId, productId },
            select: inventorySelect,
        });
    },

    // Atomically increment or decrement the running balance.
    // delta > 0 = stock in, delta < 0 = stock out / adjustment.
    upsertBalance(storeId: string, branchId: string, productId: string, delta: number, tx: Tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { storeId, branchId, productId, quantity: delta },
            update: { quantity: { increment: delta } },
            select: { quantity: true },
        });
    },

    setBalance(storeId: string, branchId: string, productId: string, quantity: number, tx: Tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId } },
            create: { storeId, branchId, productId, quantity },
            update: { quantity },
            select: { quantity: true },
        });
    },

    // ─── StockBatch ──────────────────────────────────────────────────────────

    createBatch(
        data: {
            branchId: string;
            storeId: string;
            productId: string;
            initialQty: number;
            remainingQty: number;
            costPriceUzs: number;
            costPriceUsd?: number;
            supplierNote?: string;
            createdById: string;
            receiptId?: string;
        },
        tx: Tx
    ) {
        return tx.stockBatch.create({ data, select: batchSelect });
    },

    findBatchesByIds(ids: string[], tx: Tx) {
        return tx.stockBatch.findMany({
            where: { id: { in: ids } },
            select: batchSelect,
        });
    },

    incrementBalances(
        rows: Array<{ storeId: string; branchId: string; productId: string; quantity: number }>,
        tx: Tx
    ) {
        if (rows.length === 0) return Promise.resolve([]);

        const values = Prisma.join(
            rows.map((row) =>
                Prisma.sql`(${randomUUID()}, ${row.storeId}, ${row.branchId}, ${row.productId}, ${row.quantity}, NOW())`
            )
        );

        return tx.$queryRaw<Array<{ storeId: string; branchId: string; productId: string; quantity: unknown }>>(
            Prisma.sql`
                INSERT INTO "Inventory" ("id", "storeId", "branchId", "productId", "quantity", "updatedAt")
                VALUES ${values}
                ON CONFLICT ("branchId", "productId")
                DO UPDATE SET
                    "quantity" = "Inventory"."quantity" + EXCLUDED."quantity",
                    "updatedAt" = NOW()
                RETURNING "storeId", "branchId", "productId", "quantity"
            `
        );
    },

    // Returns batches ordered oldest-first (FIFO) with remaining stock > 0
    findActiveBatches(storeId: string, branchId: string, productId: string, tx: Tx) {
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

    async sumRemainingQty(storeId: string, branchId: string, productId: string, tx: Tx) {
        const result = await tx.stockBatch.aggregate({
            where: { storeId, branchId, productId },
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
        filters: { storeId: string; branchId?: string; productId?: string; depleted?: boolean; from?: string; to?: string },
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
        filters: { storeId: string; branchId?: string; productId?: string; depleted?: boolean; from?: string; to?: string },
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

    async findReceiptsPaginated(
        filters: { storeId: string; branchId?: string; from?: string; to?: string },
        page: number,
        pageSize: number
    ) {
        const conditions: Prisma.Sql[] = [Prisma.sql`sb."storeId" = ${filters.storeId}`];
        if (filters.branchId) conditions.push(Prisma.sql`sb."branchId" = ${filters.branchId}`);
        if (filters.from) conditions.push(Prisma.sql`sb."receivedAt" >= ${new Date(filters.from)}`);
        if (filters.to) conditions.push(Prisma.sql`sb."receivedAt" <= ${new Date(filters.to)}`);
        const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
        const offset = (page - 1) * pageSize;

        const [items, countRows] = await Promise.all([
            prisma.$queryRaw<Array<{
                id: string;
                receivedAt: Date;
                productCount: number;
                pieceQuantity: unknown;
                kgQuantity: unknown;
                totalCostUzs: unknown;
                remainingValueUzs: unknown;
                supplierNote: string | null;
                branchId: string;
                branchName: string;
                createdById: string;
                createdByName: string;
            }>>(Prisma.sql`
                SELECT
                    sb."receiptId" AS id,
                    MIN(sb."receivedAt") AS "receivedAt",
                    COUNT(*)::int AS "productCount",
                    COALESCE(SUM(CASE WHEN p."unit" = 'PIECE' THEN sb."initialQty" ELSE 0 END), 0) AS "pieceQuantity",
                    COALESCE(SUM(CASE WHEN p."unit" = 'KG' THEN sb."initialQty" ELSE 0 END), 0) AS "kgQuantity",
                    COALESCE(SUM(sb."initialQty" * sb."costPriceUzs"), 0) AS "totalCostUzs",
                    COALESCE(SUM(sb."remainingQty" * sb."costPriceUzs"), 0) AS "remainingValueUzs",
                    MIN(NULLIF(sb."supplierNote", '')) AS "supplierNote",
                    b.id AS "branchId",
                    b.name AS "branchName",
                    u.id AS "createdById",
                    u."fullName" AS "createdByName"
                FROM "StockBatch" sb
                JOIN "Product" p ON p.id = sb."productId"
                JOIN "Branch" b ON b.id = sb."branchId"
                JOIN "User" u ON u.id = sb."createdById"
                ${where}
                GROUP BY sb."receiptId", b.id, b.name, u.id, u."fullName"
                ORDER BY MIN(sb."receivedAt") DESC, sb."receiptId" ASC
                LIMIT ${pageSize} OFFSET ${offset}
            `),
            prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
                SELECT COUNT(DISTINCT sb."receiptId")::bigint AS total
                FROM "StockBatch" sb
                ${where}
            `),
        ]);

        return { items, total: Number(countRows[0]?.total ?? 0) };
    },

    async findReceiptItems(
        filters: { storeId: string; branchId?: string; receiptId: string },
        page: number,
        pageSize: number
    ) {
        const where = {
            storeId: filters.storeId,
            receiptId: filters.receiptId,
            ...(filters.branchId && { branchId: filters.branchId }),
        };
        const [items, total] = await Promise.all([
            prisma.stockBatch.findMany({
                where,
                select: batchSelect,
                orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.stockBatch.count({ where }),
        ]);
        return { items, total };
    },

    countBatches(filters: { storeId: string; branchId?: string; productId?: string; depleted?: boolean; from?: string; to?: string }) {
        return prisma.stockBatch.count({ where: buildBatchWhere(filters) });
    },

    async sumBatchCostUzs(storeId: string, branchId?: string): Promise<number> {
        const rows = await prisma.$queryRaw<[{ total: unknown }]>(
            branchId
                ? Prisma.sql`SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId} AND "branchId" = ${branchId}`
                : Prisma.sql`SELECT COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId}`
        );
        return Number(rows[0].total);
    },

    async sumRemainingValueUzs(storeId: string, branchId?: string): Promise<number> {
        const rows = await prisma.$queryRaw<[{ total: unknown }]>(
            branchId
                ? Prisma.sql`SELECT COALESCE(SUM("remainingQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId} AND "branchId" = ${branchId}`
                : Prisma.sql`SELECT COALESCE(SUM("remainingQty" * "costPriceUzs"), 0)::float8 as total FROM "StockBatch" WHERE "storeId" = ${storeId}`
        );
        return Number(rows[0].total);
    },

    // ─── StockMovement ───────────────────────────────────────────────────────

    createMovement(
        data: {
            branchId: string;
            storeId: string;
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
        storeId: string;
        branchId?: string;
        productId?: string;
        type?: StockMovementType;
        from?: string;
        to?: string;
        limit: number;
    }) {
        return prisma.stockMovement.findMany({
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
