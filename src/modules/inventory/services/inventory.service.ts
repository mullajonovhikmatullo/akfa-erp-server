import { Prisma, StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchesInStore, assertProductsInStore, branchScope, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { AdjustmentDto } from "../dto/adjustment.dto";
import { StockInBatchDto, StockInDto } from "../dto/stock-in.dto";
import { InventoryRepository } from "../repositories/inventory.repository";
import {
    batchQuerySchema,
    inventoryQuerySchema,
    movementQuerySchema,
} from "../validations/inventory.validation";
import { z } from "zod";
import { claimIdempotency, completeIdempotency } from "../../../core/services/idempotency.service";

type ResolvedStockIn = {
    dto: StockInDto;
    storeId: string;
    branchId: string;
};

function stockInKey(branchId: string, productId: string) {
    return `${branchId}:${productId}`;
}

async function assertActiveActor(userId: string, storeId: string, tx: Prisma.TransactionClient) {
    const actor = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, storeId: true, isActive: true },
    });

    if (!actor || !actor.isActive || actor.storeId !== storeId) {
        throw new AppError(401, "Unauthorized");
    }
}

async function assertStockInTargets(items: ResolvedStockIn[], storeId: string, tx: Prisma.TransactionClient) {
    const branchIds = [...new Set(items.map((item) => item.branchId))];
    const productIds = [...new Set(items.map((item) => item.dto.productId))];

    const branches = await tx.branch.findMany({
        where: { id: { in: branchIds }, storeId },
        select: { id: true },
    });
    const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId },
        select: { id: true, isActive: true },
    });

    const foundBranchIds = new Set(branches.map((branch) => branch.id));
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of items) {
        if (!foundBranchIds.has(item.branchId)) {
            throw new AppError(404, "Branch not found");
        }

        const product = productById.get(item.dto.productId);
        if (!product) {
            throw new AppError(404, "Product not found");
        }
        if (!product.isActive) {
            throw new AppError(409, "Cannot stock an inactive product");
        }
    }
}

async function createStockInEntry(
    item: ResolvedStockIn,
    createdById: string,
    tx: Prisma.TransactionClient
) {
    const batch = await InventoryRepository.createBatch(
        {
            branchId: item.branchId,
            storeId: item.storeId,
            productId: item.dto.productId,
            initialQty: item.dto.quantity,
            remainingQty: item.dto.quantity,
            costPriceUzs: item.dto.costPriceUzs,
            costPriceUsd: item.dto.costPriceUsd,
            supplierNote: item.dto.supplierNote,
            createdById,
        },
        tx
    );

    const updatedInventory = await InventoryRepository.upsertBalance(
        item.storeId,
        item.branchId,
        item.dto.productId,
        item.dto.quantity,
        tx
    );

    await InventoryRepository.createMovement(
        {
            branchId: item.branchId,
            storeId: item.storeId,
            productId: item.dto.productId,
            type: StockMovementType.STOCK_IN,
            quantity: item.dto.quantity,
            balanceAfter: Number(updatedInventory.quantity),
            note: item.dto.supplierNote,
            createdById,
        },
        tx
    );

    return batch;
}

export const InventoryService = {
    // ─── Stock In ─────────────────────────────────────────────────────────────

    async stockIn(dto: StockInDto, user: JwtPayload, idempotencyKey?: string) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(dto.branchId, user);
        const item = { dto, storeId, branchId };

        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId, "shared");
            const claim = await claimIdempotency(tx, { storeId, userId: user.id, operation: "stock-in" }, idempotencyKey, { dto, branchId });
            if (claim?.replay) {
                const [previous] = await InventoryRepository.findBatchesByIds(claim.resourceIds, storeId, tx);
                if (!previous) throw new AppError(409, "Original stock-in result is unavailable");
                return previous;
            }
            await assertActiveActor(user.id, storeId, tx);
            await assertStockInTargets([item], storeId, tx);
            await InventoryRepository.lockStock(storeId, [{ branchId, productId: dto.productId }], tx);
            const batch = await createStockInEntry(item, user.id, tx);
            await completeIdempotency(tx, claim, [batch.id]);
            return batch;
        }, transactionOptions);
    },

    async stockInBatch(dtos: StockInBatchDto, user: JwtPayload, idempotencyKey?: string) {
        const storeId = requireStoreId(user);
        const items = dtos.map((dto) => ({
            dto,
            storeId,
            branchId: resolveBranchId(dto.branchId, user),
        }));

        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId, "shared");
            const claim = await claimIdempotency(tx, { storeId, userId: user.id, operation: "stock-in-batch" }, idempotencyKey, items);
            if (claim?.replay) {
                const batches = await InventoryRepository.findBatchesByIds(claim.resourceIds, storeId, tx);
                const byId = new Map(batches.map((batch) => [batch.id, batch]));
                return claim.resourceIds.map((id) => {
                    const batch = byId.get(id);
                    if (!batch) throw new AppError(409, "Original stock-in result is unavailable");
                    return batch;
                });
            }
            await assertActiveActor(user.id, storeId, tx);
            await assertStockInTargets(items, storeId, tx);
            await InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId: item.branchId, productId: item.dto.productId })), tx);
            const receiptId = randomUUID();
            const batchIds = items.map(() => randomUUID());
            const balanceIncrements = new Map<string, { storeId: string; branchId: string; productId: string; quantity: number }>();

            items.forEach((item) => {
                const key = stockInKey(item.branchId, item.dto.productId);
                const current = balanceIncrements.get(key);
                if (current) {
                    current.quantity = Number((current.quantity + item.dto.quantity).toFixed(4));
                } else {
                    balanceIncrements.set(key, {
                        storeId: item.storeId,
                        branchId: item.branchId,
                        productId: item.dto.productId,
                        quantity: item.dto.quantity,
                    });
                }
            });

            await tx.stockBatch.createMany({
                data: items.map((item, index) => ({
                    id: batchIds[index],
                    receiptId,
                    storeId: item.storeId,
                    branchId: item.branchId,
                    productId: item.dto.productId,
                    initialQty: item.dto.quantity,
                    remainingQty: item.dto.quantity,
                    costPriceUzs: item.dto.costPriceUzs,
                    costPriceUsd: item.dto.costPriceUsd,
                    supplierNote: item.dto.supplierNote,
                    createdById: user.id,
                })),
            });

            const updatedBalances = await InventoryRepository.incrementBalances(
                [...balanceIncrements.values()],
                tx
            );
            const finalBalanceByKey = new Map(
                updatedBalances.map((row) => [
                    stockInKey(row.branchId, row.productId),
                    Number(row.quantity),
                ])
            );

            const laterQuantityByKey = new Map<string, number>();
            const movements = Array(items.length);
            for (let index = items.length - 1; index >= 0; index--) {
                const item = items[index];
                const key = stockInKey(item.branchId, item.dto.productId);
                const laterQuantity = laterQuantityByKey.get(key) ?? 0;
                const finalBalance = finalBalanceByKey.get(key) ?? item.dto.quantity;
                const balanceAfter = Number((finalBalance - laterQuantity).toFixed(4));

                movements[index] = {
                    storeId: item.storeId,
                    branchId: item.branchId,
                    productId: item.dto.productId,
                    type: StockMovementType.STOCK_IN,
                    quantity: item.dto.quantity,
                    balanceAfter,
                    note: item.dto.supplierNote,
                    createdById: user.id,
                };

                laterQuantityByKey.set(
                    key,
                    Number((laterQuantity + item.dto.quantity).toFixed(4))
                );
            }

            await tx.stockMovement.createMany({ data: movements });

            const batches = await InventoryRepository.findBatchesByIds(batchIds, storeId, tx);
            const batchById = new Map(batches.map((batch) => [batch.id, batch]));
            await completeIdempotency(tx, claim, batchIds);
            return batchIds
                .map((id) => batchById.get(id))
                .filter((batch): batch is NonNullable<typeof batch> => Boolean(batch));
        }, transactionOptions);
    },

    // ─── Manual Adjustment ───────────────────────────────────────────────────

    async adjust(dto: AdjustmentDto, user: JwtPayload, idempotencyKey?: string) {
        const storeId = requireStoreId(user);
        const branchId = resolveBranchId(dto.branchId, user);
        await Promise.all([
            assertBranchesInStore([branchId], storeId),
            assertProductsInStore([dto.productId], storeId),
        ]);

        return prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId, "shared");
            const claim = await claimIdempotency(tx, { storeId, userId: user.id, operation: "stock-adjustment" }, idempotencyKey, { dto, branchId });
            if (claim?.replay) {
                const movement = await InventoryRepository.findMovement(claim.resourceIds[0], storeId, tx);
                if (!movement) throw new AppError(409, "Original adjustment is unavailable");
                return {
                    previousQuantity: new Prisma.Decimal(movement.balanceAfter).minus(movement.quantity).toNumber(),
                    newQuantity: Number(movement.balanceAfter), delta: Number(movement.quantity), movement,
                };
            }
            await InventoryRepository.lockStock(storeId, [{ branchId, productId: dto.productId }], tx);
            const current = await InventoryRepository.findOne(storeId, branchId, dto.productId, tx);
            const currentQty = Number(current?.quantity ?? 0);
            const delta = new Prisma.Decimal(dto.newQuantity).minus(currentQty).toNumber();
            const batchQty = await InventoryRepository.sumRemainingQty(storeId, branchId, dto.productId, tx);
            if (delta === 0 && new Prisma.Decimal(batchQty).equals(dto.newQuantity)) {
                throw new AppError(400, "New quantity is the same as current stock — no adjustment needed");
            }
            const batchDelta = new Prisma.Decimal(dto.newQuantity).minus(batchQty);
            if (batchDelta.isNegative()) {
                await InventoryRepository.consumeBatches(storeId, branchId, [{ productId: dto.productId, quantity: batchDelta.abs().toNumber() }], tx);
            } else if (batchDelta.isPositive()) {
                const product = await tx.product.findFirstOrThrow({
                    where: { id: dto.productId, storeId },
                    select: { costPriceUzs: true, costPriceUsd: true },
                });
                await InventoryRepository.createBatch({
                    storeId, branchId, productId: dto.productId,
                    initialQty: batchDelta.toNumber(), remainingQty: batchDelta.toNumber(),
                    costPriceUzs: Number(product.costPriceUzs),
                    costPriceUsd: product.costPriceUsd === null ? undefined : Number(product.costPriceUsd),
                    supplierNote: `Adjustment: ${dto.reason}`, createdById: user.id,
                }, tx);
            }
            const updatedInventory = await InventoryRepository.setBalance(
                storeId,
                branchId,
                dto.productId,
                dto.newQuantity,
                tx
            );

            const movement = await InventoryRepository.createMovement(
                {
                    storeId,
                    branchId,
                    productId: dto.productId,
                    type: StockMovementType.ADJUSTMENT,
                    quantity: delta,
                    balanceAfter: Number(updatedInventory.quantity),
                    note: dto.reason,
                    createdById: user.id,
                },
                tx
            );

            await completeIdempotency(tx, claim, [movement.id]);
            return {
                previousQuantity: currentQty,
                newQuantity: dto.newQuantity,
                delta,
                movement,
            };
        }, transactionOptions);
    },

    // ─── Read Operations ─────────────────────────────────────────────────────

    async findAll(query: z.infer<typeof inventoryQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);

        return InventoryRepository.findAll({
            ...scope,
            productId: query.productId,
            categoryId: query.categoryId,
            lowStock: query.lowStock,
            limit: query.limit,
            offset: query.offset,
        });
    },

    async findMovements(query: z.infer<typeof movementQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);

        return InventoryRepository.findMovements({
            ...scope,
            productId: query.productId,
            type: query.type,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },

    async findBatches(query: z.infer<typeof batchQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);

        return InventoryRepository.findBatches({
            ...scope,
            productId: query.productId,
            depleted: query.depleted,
            from: query.from,
            to: query.to,
            limit: query.limit,
            offset: query.offset,
        });
    },

    async findBatchesSummary(query: z.infer<typeof batchQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);
        return InventoryRepository.batchesSummary(scope.storeId, scope.branchId);
    },

    async findBatchesPaginated(
        query: z.infer<typeof batchQuerySchema>,
        page: number,
        pageSize: number,
        user: JwtPayload
    ) {
        const scope = branchScope(user, query.branchId);
        const filters = {
            ...scope,
            productId: query.productId,
            depleted: query.depleted,
            from: query.from,
            to: query.to,
        };
        const hasFilters = query.productId || query.depleted !== undefined || query.from || query.to;
        const [items, summary, filteredTotal] = await Promise.all([
            InventoryRepository.findBatchesPaginated(filters, page, pageSize),
            InventoryRepository.batchesSummary(scope.storeId, scope.branchId),
            hasFilters ? InventoryRepository.countBatches(filters) : Promise.resolve(null),
        ]);
        return { items, total: filteredTotal ?? summary.totalBatches, ...summary };
    },

    async findReceiptsPaginated(
        query: z.infer<typeof batchQuerySchema>, page: number, pageSize: number, user: JwtPayload
    ) {
        const scope = branchScope(user, query.branchId);
        const result = await InventoryRepository.findReceiptsPaginated(
            { ...scope, from: query.from, to: query.to }, page, pageSize
        );
        return {
            total: result.total,
            items: result.items.map((item) => ({
                id: item.id, receivedAt: item.receivedAt, productCount: item.productCount,
                pieceQuantity: Number(item.pieceQuantity), kgQuantity: Number(item.kgQuantity),
                totalCostUzs: Number(item.totalCostUzs), remainingValueUzs: Number(item.remainingValueUzs),
                supplierNote: item.supplierNote,
                branch: { id: item.branchId, name: item.branchName },
                createdBy: { id: item.createdById, fullName: item.createdByName },
            })),
        };
    },

    async findReceiptItems(receiptId: string, page: number, pageSize: number, user: JwtPayload) {
        return InventoryRepository.findReceiptItems({ ...branchScope(user), receiptId }, page, pageSize);
    },

    // ─── Internal: FIFO deduction ─────────────────────────────────────────────
    // Called by SalesService (STOCK_OUT) and TransfersService (TRANSFER_OUT).
    // movementType lets the caller control what gets logged in StockMovement.

    async deductStock(
        storeId: string,
        branchId: string,
        productId: string,
        quantity: number,
        createdById: string,
        note: string,
        tx: Prisma.TransactionClient,
        movementType: StockMovementType = StockMovementType.STOCK_OUT
    ) {
        const balances = await InventoryService.deductStockBatch(
            storeId, branchId, [{ productId, quantity }], createdById, note, tx, movementType
        );
        return Number(balances[0].quantity);
    },

    async deductStockBatch(
        storeId: string,
        branchId: string,
        items: Array<{ productId: string; quantity: number }>,
        createdById: string,
        note: string,
        tx: Prisma.TransactionClient,
        movementType: StockMovementType = StockMovementType.STOCK_OUT,
        transferItems?: Array<{ id: string; productId: string }>
    ) {
        if (items.length === 0) return [];
        await InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        const balances = await InventoryRepository.deductBalances(storeId, branchId, items, tx);
        await InventoryRepository.consumeBatches(storeId, branchId, items, tx, transferItems);
        const byProduct = new Map(balances.map((row) => [row.productId, row.quantity]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, productId: item.productId, type: movementType,
                quantity: -item.quantity, balanceAfter: byProduct.get(item.productId)!, note, createdById,
            })),
        });
        return balances;
    },

    // ─── Internal: Transfer-in (called by TransfersService) ──────────────────
    // Creates a new StockBatch at the destination branch so cost price
    // is preserved for future FIFO deductions and COGS calculations.

    async restoreTransferStockBatch(
        storeId: string, branchId: string, transferId: string,
        items: Array<{ productId: string; quantity: number }>,
        createdById: string, note: string, tx: Prisma.TransactionClient
    ): Promise<void> {
        if (items.length === 0) return;
        await InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        const restored = await InventoryRepository.restoreTransferBatches(storeId, branchId, transferId, tx);
        const byProduct = new Map(restored.map((row) => [row.productId, row.quantity]));
        if (restored.length !== items.length || items.some((item) =>
            !new Prisma.Decimal(byProduct.get(item.productId) ?? 0).equals(item.quantity))) {
            throw new AppError(409, "Cannot restore transfer reservation; reconcile inventory");
        }
        const balances = await InventoryRepository.incrementBalances(items.map((item) => ({
            storeId, branchId, ...item,
        })), tx);
        const balanceByProduct = new Map(balances.map((row) => [row.productId, String(row.quantity)]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, ...item, type: StockMovementType.TRANSFER_IN,
                balanceAfter: balanceByProduct.get(item.productId)!, note, createdById,
            })),
        });
    },

    async transferInBatch(
        storeId: string,
        branchId: string,
        items: Array<{ productId: string; quantity: number; costPriceUzs: number }>,
        note: string,
        createdById: string,
        tx: Prisma.TransactionClient,
        receiptId: string = randomUUID()
    ): Promise<void> {
        await InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        await tx.stockBatch.createMany({
            data: items.map((item) => ({
                receiptId, storeId, branchId, productId: item.productId, initialQty: item.quantity,
                remainingQty: item.quantity, costPriceUzs: item.costPriceUzs, supplierNote: note, createdById,
            })),
        });
        const balances = await InventoryRepository.incrementBalances(items.map((item) => ({
            storeId, branchId, productId: item.productId, quantity: item.quantity,
        })), tx);
        const byProduct = new Map(balances.map((row) => [row.productId, String(row.quantity)]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, productId: item.productId, quantity: item.quantity,
                type: StockMovementType.TRANSFER_IN, balanceAfter: byProduct.get(item.productId)!, note, createdById,
            })),
        });
    },

    async transferIn(
        storeId: string,
        branchId: string,
        productId: string,
        quantity: number,
        costPriceUzs: number,
        note: string,
        createdById: string,
        tx: Prisma.TransactionClient
    ) {
        await InventoryRepository.lockStock(storeId, [{ branchId, productId }], tx);
        await InventoryRepository.createBatch(
            {
                storeId,
                branchId,
                productId,
                initialQty: quantity,
                remainingQty: quantity,
                costPriceUzs,
                supplierNote: note,
                createdById,
            },
            tx
        );

        const updated = await InventoryRepository.upsertBalance(storeId, branchId, productId, quantity, tx);

        await InventoryRepository.createMovement(
            {
                storeId,
                branchId,
                productId,
                type: StockMovementType.TRANSFER_IN,
                quantity,
                balanceAfter: Number(updated.quantity),
                note,
                createdById,
            },
            tx
        );

        return Number(updated.quantity);
    },
};
