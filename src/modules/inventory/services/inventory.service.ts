import { Prisma, StockMovementType } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, resolveBranchId } from "../../../core/utils/branch-access";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { AdjustmentDto } from "../dto/adjustment.dto";
import { StockInDto } from "../dto/stock-in.dto";
import { InventoryRepository } from "../repositories/inventory.repository";
import {
    batchQuerySchema,
    inventoryQuerySchema,
    movementQuerySchema,
} from "../validations/inventory.validation";
import { z } from "zod";

export const InventoryService = {
    // ─── Stock In ─────────────────────────────────────────────────────────────

    async stockIn(dto: StockInDto, user: JwtPayload) {
        const branchId = resolveBranchId(dto.branchId, user);

        const [branch, product] = await Promise.all([
            prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
            prisma.product.findUnique({
                where: { id: dto.productId },
                select: { id: true, isActive: true },
            }),
        ]);

        if (!branch) throw new AppError(404, "Branch not found");
        if (!product) throw new AppError(404, "Product not found");
        if (!product.isActive) throw new AppError(409, "Cannot stock an inactive product");

        return prisma.$transaction(async (tx) => {
            const batch = await InventoryRepository.createBatch(
                {
                    branchId,
                    productId: dto.productId,
                    initialQty: dto.quantity,
                    remainingQty: dto.quantity,
                    costPriceUzs: dto.costPriceUzs,
                    costPriceUsd: dto.costPriceUsd,
                    supplierNote: dto.supplierNote,
                    createdById: user.id,
                },
                tx
            );

            const updatedInventory = await InventoryRepository.upsertBalance(
                branchId,
                dto.productId,
                dto.quantity,
                tx
            );

            await InventoryRepository.createMovement(
                {
                    branchId,
                    productId: dto.productId,
                    type: StockMovementType.STOCK_IN,
                    quantity: dto.quantity,
                    balanceAfter: Number(updatedInventory.quantity),
                    note: dto.supplierNote,
                    createdById: user.id,
                },
                tx
            );

            return batch;
        });
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
        });
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
        });
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
        };
        const [items, total, totalBatches, totalActive, totalCostUzs] = await Promise.all([
            InventoryRepository.findBatchesPaginated(filters, page, pageSize),
            InventoryRepository.countBatches(filters),
            InventoryRepository.countBatches({ branchId: scope.branchId }),
            InventoryRepository.countBatches({ branchId: scope.branchId, depleted: false }),
            InventoryRepository.sumBatchCostUzs(scope.branchId),
        ]);
        return { items, total, totalBatches, totalActive, totalCostUzs };
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
        const inventory = await InventoryRepository.findOne(branchId, productId, tx);
        const currentQty = inventory ? Number(inventory.quantity) : 0;

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
        const batches = await InventoryRepository.findActiveBatches(branchId, productId, tx);
        let remaining = quantity;

        for (const batch of batches) {
            if (remaining <= 0) break;
            const consume = Math.min(Number(batch.remainingQty), remaining);
            await InventoryRepository.decrementBatch(batch.id, consume, tx);
            remaining -= consume;
        }

        const updated = await InventoryRepository.upsertBalance(branchId, productId, -quantity, tx);

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

        const updated = await InventoryRepository.upsertBalance(branchId, productId, quantity, tx);

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
