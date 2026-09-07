import { Prisma, StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppError } from "../../../core/errors/AppError";
import { DEFAULT_LIST_LIMIT } from "../../../core/utils/pagination";
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
    limit?: number;
    offset?: number;
};

export const InventoryRepository = {
    async lockStock(
        storeId: string,
        targets: Array<{ branchId: string; productId: string }>,
        tx: Tx
    ): Promise<void> {
        const keys = [...new Set(targets.map(({ branchId, productId }) =>
            `inventory:${storeId}:${branchId}:${productId}`))].sort();
        if (keys.length === 0) return;
        // Transaction advisory locks cover absent Inventory rows too. All stock
        // writers acquire the complete, ordered set before touching any stock.
        await tx.$queryRaw(Prisma.sql`
            SELECT pg_advisory_xact_lock(hashtextextended(key, 0))::text
            FROM (SELECT unnest(ARRAY[${Prisma.join(keys)}]::text[]) AS key ORDER BY key) ordered
        `);
    },

    async deductBalances(
        storeId: string,
        branchId: string,
        items: Array<{ productId: string; quantity: number }>,
        tx: Tx
    ) {
        const values = Prisma.join(items.map((item) =>
            Prisma.sql`(${item.productId}::text, ${item.quantity}::numeric)`));
        const balances = await tx.$queryRaw<Array<{ productId: string; quantity: string }>>(Prisma.sql`
            UPDATE "Inventory" inv SET quantity = inv.quantity - requested.quantity, "updatedAt" = NOW()
            FROM (VALUES ${values}) AS requested("productId", quantity)
            WHERE inv."storeId" = ${storeId} AND inv."branchId" = ${branchId}
              AND inv."productId" = requested."productId" AND inv.quantity >= requested.quantity
            RETURNING inv."productId", inv.quantity::text
        `);
        if (balances.length !== items.length) throw new AppError(409, "Insufficient stock for one or more products");
        return balances;
    },

    async consumeBatches(
        storeId: string,
        branchId: string,
        items: Array<{ productId: string; quantity: number }>,
        tx: Tx,
        transferItems?: Array<{ id: string; productId: string }>
    ): Promise<void> {
        const values = Prisma.join(items.map((item) =>
            Prisma.sql`(${item.productId}::text, ${item.quantity}::numeric)`));
        const consumed = await tx.$queryRaw<Array<{ productId: string; quantity: string }>>(Prisma.sql`
            WITH fifo AS (
                SELECT sb.id, sb."productId", sb."remainingQty", requested.quantity,
                    COALESCE(SUM(sb."remainingQty") OVER (
                        PARTITION BY sb."productId" ORDER BY sb."receivedAt", sb.id
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ), 0) AS preceding
                FROM "StockBatch" sb
                JOIN (VALUES ${values}) AS requested("productId", quantity)
                  ON requested."productId" = sb."productId"
                WHERE sb."storeId" = ${storeId} AND sb."branchId" = ${branchId} AND sb."remainingQty" > 0
            ), deductions AS (
                SELECT id, "productId", LEAST("remainingQty", quantity - preceding) AS amount
                FROM fifo WHERE preceding < quantity
            ), changed AS (
                UPDATE "StockBatch" sb
                SET "remainingQty" = sb."remainingQty" - deductions.amount, "updatedAt" = NOW()
                FROM deductions WHERE sb.id = deductions.id AND sb."remainingQty" >= deductions.amount
                RETURNING sb.id, sb."productId", deductions.amount
            )
            ${transferItems?.length ? Prisma.sql`, allocated AS (
                INSERT INTO "TransferAllocation" (id, "transferItemId", "stockBatchId", quantity, "createdAt")
                SELECT gen_random_uuid()::text, item.id, changed.id, changed.amount, NOW()
                FROM changed JOIN (VALUES ${Prisma.join(transferItems.map((item) =>
                    Prisma.sql`(${item.id}::text, ${item.productId}::text)`))}) AS item(id, "productId")
                  ON item."productId" = changed."productId"
                RETURNING id
            )` : Prisma.empty}
            SELECT "productId", SUM(amount)::text AS quantity FROM changed GROUP BY "productId"
        `);
        const byProduct = new Map(consumed.map((row) => [row.productId, row.quantity]));
        if (items.some((item) => !new Prisma.Decimal(byProduct.get(item.productId) ?? 0).equals(item.quantity))) {
            throw new AppError(409, "Stock batches do not cover the requested quantity; reconcile inventory");
        }
    },

    async findAll(filters: InventoryFilters) {
        let ids: string[] | undefined;
        if (filters.lowStock) {
            const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
                SELECT inv.id FROM "Inventory" inv JOIN "Product" p ON p.id = inv."productId"
                WHERE inv."storeId" = ${filters.storeId} AND p."storeId" = ${filters.storeId}
                  AND inv.quantity <= p."lowStockThreshold"
                  ${filters.branchId ? Prisma.sql`AND inv."branchId" = ${filters.branchId}` : Prisma.empty}
                  ${filters.productId ? Prisma.sql`AND inv."productId" = ${filters.productId}` : Prisma.empty}
                  ${filters.categoryId ? Prisma.sql`AND p."categoryId" = ${filters.categoryId}` : Prisma.empty}
                ORDER BY inv."updatedAt" DESC, inv.id ASC
                LIMIT ${filters.limit ?? DEFAULT_LIST_LIMIT} OFFSET ${filters.offset ?? 0}
            `);
            ids = rows.map((row) => row.id);
        }
        return prisma.inventory.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.productId && { productId: filters.productId }),
                ...(filters.categoryId && {
                    product: { categoryId: filters.categoryId },
                }),
                ...(ids && { id: { in: ids } }),
            },
            select: inventorySelect,
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take: filters.limit ?? DEFAULT_LIST_LIMIT,
            skip: ids ? 0 : filters.offset ?? 0,
        });
    },

    async restoreTransferBatches(storeId: string, branchId: string, transferId: string, tx: Tx) {
        // Caller holds the transfer transition and all source inventory locks.
        // Restore the original FIFO batches, not a newly valued receipt.
        return tx.$queryRaw<Array<{ productId: string; quantity: string }>>(Prisma.sql`
            WITH reserved AS (
                SELECT a."stockBatchId", ti."productId", SUM(a.quantity) AS quantity
                FROM "TransferAllocation" a
                JOIN "TransferItem" ti ON ti.id = a."transferItemId"
                JOIN "Transfer" tr ON tr.id = ti."transferId"
                WHERE tr.id = ${transferId} AND tr."storeId" = ${storeId} AND tr."fromBranchId" = ${branchId}
                GROUP BY a."stockBatchId", ti."productId"
            ), restored AS (
                UPDATE "StockBatch" sb SET "remainingQty" = sb."remainingQty" + r.quantity, "updatedAt" = NOW()
                FROM reserved r WHERE sb.id = r."stockBatchId" AND sb."productId" = r."productId"
                  AND sb."storeId" = ${storeId} AND sb."branchId" = ${branchId}
                  AND sb."remainingQty" + r.quantity <= sb."initialQty"
                RETURNING sb."productId", r.quantity
            )
            SELECT "productId", SUM(quantity)::text AS quantity FROM restored GROUP BY "productId"
        `);
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
            where: { branchId_productId: { branchId, productId }, storeId },
            create: { storeId, branchId, productId, quantity: delta },
            update: { quantity: { increment: delta } },
            select: { quantity: true },
        });
    },

    setBalance(storeId: string, branchId: string, productId: string, quantity: number, tx: Tx) {
        return tx.inventory.upsert({
            where: { branchId_productId: { branchId, productId }, storeId },
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

    findBatchesByIds(ids: string[], storeId: string, tx: Tx) {
        return tx.stockBatch.findMany({
            where: { id: { in: ids }, storeId },
            select: batchSelect,
        });
    },

    async incrementBalances(
        rows: Array<{ storeId: string; branchId: string; productId: string; quantity: number }>,
        tx: Tx
    ) {
        if (rows.length === 0) return Promise.resolve([]);

        const values = Prisma.join(
            rows.map((row) =>
                Prisma.sql`(${randomUUID()}, ${row.storeId}, ${row.branchId}, ${row.productId}, ${row.quantity}, NOW())`
            )
        );

        const balances = await tx.$queryRaw<Array<{ storeId: string; branchId: string; productId: string; quantity: unknown }>>(
            Prisma.sql`
                INSERT INTO "Inventory" ("id", "storeId", "branchId", "productId", "quantity", "updatedAt")
                VALUES ${values}
                ON CONFLICT ("branchId", "productId")
                DO UPDATE SET
                    "quantity" = "Inventory"."quantity" + EXCLUDED."quantity",
                    "updatedAt" = NOW()
                WHERE "Inventory"."storeId" = EXCLUDED."storeId"
                RETURNING "storeId", "branchId", "productId", "quantity"
            `
        );
        if (balances.length !== rows.length) throw new AppError(409, "Inventory ownership is inconsistent");
        return balances;
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
        filters: { storeId: string; branchId?: string; productId?: string; depleted?: boolean; from?: string; to?: string; limit?: number; offset?: number },
        tx?: Tx
    ) {
        const client = tx ?? prisma;
        return client.stockBatch.findMany({
            where: buildBatchWhere(filters),
            select: batchSelect,
            orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
            take: filters.limit ?? DEFAULT_LIST_LIMIT,
            skip: filters.offset ?? 0,
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

    async batchesSummary(storeId: string, branchId?: string) {
        const [row] = await prisma.$queryRaw<Array<{
            totalBatches: string; totalActive: string; totalCostUzs: string; totalRemainingValueUzs: string;
        }>>(Prisma.sql`
            SELECT COUNT(*)::text AS "totalBatches",
                COUNT(*) FILTER (WHERE "remainingQty" > 0)::text AS "totalActive",
                COALESCE(SUM("initialQty" * "costPriceUzs"), 0)::text AS "totalCostUzs",
                COALESCE(SUM("remainingQty" * "costPriceUzs"), 0)::text AS "totalRemainingValueUzs"
            FROM "StockBatch" WHERE "storeId" = ${storeId}
                ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        `);
        return {
            totalBatches: Number(row.totalBatches), totalActive: Number(row.totalActive),
            totalCostUzs: Number(row.totalCostUzs), totalRemainingValueUzs: Number(row.totalRemainingValueUzs),
        };
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

    findMovement(id: string, storeId: string, tx: Tx) {
        return tx.stockMovement.findFirst({ where: { id, storeId }, select: movementSelect });
    },

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
