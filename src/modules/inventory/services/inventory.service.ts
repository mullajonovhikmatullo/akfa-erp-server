import { Prisma, StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, resolveBranchId } from "../../../core/utils/branch-access";
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

type ResolvedStockIn = {
    dto: StockInDto;
    branchId: string;
};

function stockInKey(branchId: string, productId: string) {
    return `${branchId}:${productId}`;
}

async function assertActiveActor(userId: string) {
    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
    });

    if (!actor || !actor.isActive) {
        throw new AppError(401, "Unauthorized");
    }
}

async function assertStockInTargets(items: ResolvedStockIn[]) {
    const branchIds = [...new Set(items.map((item) => item.branchId))];
    const productIds = [...new Set(items.map((item) => item.dto.productId))];

    const [branches, products] = await Promise.all([
        prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true },
        }),
        prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, isActive: true },
        }),
    ]);

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

    const availableQty = await InventoryRepository.sumRemainingQty(
        item.branchId,
        item.dto.productId,
        tx
    );
    const updatedInventory = await InventoryRepository.setBalance(
        item.branchId,
        item.dto.productId,
        availableQty,
        tx
    );

    await InventoryRepository.createMovement(
        {
            branchId: item.branchId,
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

    async stockIn(dto: StockInDto, user: JwtPayload) {
        const branchId = resolveBranchId(dto.branchId, user);
        const item = { dto, branchId };

        await Promise.all([
            assertActiveActor(user.id),
            assertStockInTargets([item]),
        ]);

        return prisma.$transaction(async (tx) => {
            return createStockInEntry(item, user.id, tx);
        }, transactionOptions);
    },

    async stockInBatch(dtos: StockInBatchDto, user: JwtPayload) {
        const items = dtos.map((dto) => ({
            dto,
            branchId: resolveBranchId(dto.branchId, user),
        }));

        await Promise.all([
            assertActiveActor(user.id),
            assertStockInTargets(items),
        ]);

        return prisma.$transaction(async (tx) => {
            const batchIds = items.map(() => randomUUID());
            const balanceIncrements = new Map<string, { branchId: string; productId: string; quantity: number }>();

            items.forEach((item) => {
                const key = stockInKey(item.branchId, item.dto.productId);
                const current = balanceIncrements.get(key);
                if (current) {
                    current.quantity = Number((current.quantity + item.dto.quantity).toFixed(4));
                } else {
                    balanceIncrements.set(key, {
                        branchId: item.branchId,
                        productId: item.dto.productId,
                        quantity: item.dto.quantity,
                    });
                }
            });

            await tx.stockBatch.createMany({
                data: items.map((item, index) => ({
                    id: batchIds[index],
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

            const batches = await InventoryRepository.findBatchesByIds(batchIds, tx);
            const batchById = new Map(batches.map((batch) => [batch.id, batch]));
            return batchIds
                .map((id) => batchById.get(id))
                .filter((batch): batch is NonNullable<typeof batch> => Boolean(batch));
        }, transactionOptions);
    },

    // ─── Manual Adjustment ───────────────────────────────────────────────────

    async adjust(dto: AdjustmentDto, user: JwtPayload) {
        const branchId = resolveBranchId(dto.branchId, user);

        const current = await InventoryRepository.findOne(branchId, dto.productId);
        const currentQty = current ? Number(current.quantity) : 0;
        const delta = dto.newQuantity - currentQty;

        if (delta === 0) {
            throw new AppError(400, "New quantity is the same as current stock — no adjustment needed");
        }

        return prisma.$transaction(async (tx) => {
            const updatedInventory = await InventoryRepository.upsertBalance(
                branchId,
                dto.productId,
                delta,
                tx
            );

            const movement = await InventoryRepository.createMovement(
                {
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

        const records = await InventoryRepository.findAll({
            ...scope,
            productId: query.productId,
            categoryId: query.categoryId,
        });

        if (!query.lowStock) return records;

        return records.filter((inv) => {
            const threshold = inv.product.lowStockThreshold;
            if (threshold === null) return false;
            return Number(inv.quantity) <= Number(threshold);
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
        });
    },

    async findBatchesSummary(user: JwtPayload) {
        const scope = branchScope(user);
        const [totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs] = await Promise.all([
            InventoryRepository.countBatches({ branchId: scope.branchId }),
            InventoryRepository.countBatches({ branchId: scope.branchId, depleted: false }),
            InventoryRepository.sumBatchCostUzs(scope.branchId),
            InventoryRepository.sumRemainingValueUzs(scope.branchId),
        ]);

        return { totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs };
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
        const [items, total, totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs] = await Promise.all([
            InventoryRepository.findBatchesPaginated(filters, page, pageSize),
            InventoryRepository.countBatches(filters),
            InventoryRepository.countBatches({ branchId: scope.branchId }),
            InventoryRepository.countBatches({ branchId: scope.branchId, depleted: false }),
            InventoryRepository.sumBatchCostUzs(scope.branchId),
            InventoryRepository.sumRemainingValueUzs(scope.branchId),
        ]);
        return { items, total, totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs };
    },

    // ─── Internal: FIFO deduction ─────────────────────────────────────────────
    // Called by SalesService (STOCK_OUT) and TransfersService (TRANSFER_OUT).
    // movementType lets the caller control what gets logged in StockMovement.

    async deductStock(
        branchId: string,
        productId: string,
        quantity: number,
        createdById: string,
        note: string,
        tx: Prisma.TransactionClient,
        movementType: StockMovementType = StockMovementType.STOCK_OUT
    ) {
        const batches = await InventoryRepository.findActiveBatches(branchId, productId, tx);
        const currentQty = batches.reduce((sum, batch) => sum + Number(batch.remainingQty), 0);

        if (currentQty < quantity) {
            const productRecord = await tx.product.findUnique({
                where: { id: productId },
                select: { name: true },
            });
            throw new AppError(
                409,
                `Insufficient stock for "${productRecord?.name}": available ${currentQty}, requested ${quantity}`
            );
        }

        // FIFO: consume from oldest batches first
        let remaining = quantity;

        for (const batch of batches) {
            if (remaining <= 0) break;
            const consume = Math.min(Number(batch.remainingQty), remaining);
            await InventoryRepository.decrementBatch(batch.id, consume, tx);
            remaining -= consume;
        }

        const nextQty = Number(Math.max(0, currentQty - quantity).toFixed(4));
        const updated = await InventoryRepository.setBalance(branchId, productId, nextQty, tx);

        await InventoryRepository.createMovement(
            {
                branchId,
                productId,
                type: movementType,
                quantity: -quantity,
                balanceAfter: Number(updated.quantity),
                note,
                createdById,
            },
            tx
        );

        return Number(updated.quantity);
    },

    // ─── Internal: Transfer-in (called by TransfersService) ──────────────────
    // Creates a new StockBatch at the destination branch so cost price
    // is preserved for future FIFO deductions and COGS calculations.

    async transferIn(
        branchId: string,
        productId: string,
        quantity: number,
        costPriceUzs: number,
        note: string,
        createdById: string,
        tx: Prisma.TransactionClient
    ) {
        await InventoryRepository.createBatch(
            {
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

        const availableQty = await InventoryRepository.sumRemainingQty(branchId, productId, tx);
        const updated = await InventoryRepository.setBalance(branchId, productId, availableQty, tx);

        await InventoryRepository.createMovement(
            {
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
