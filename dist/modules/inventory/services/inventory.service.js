"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const inventory_repository_1 = require("../repositories/inventory.repository");
function stockInKey(branchId, productId) {
    return `${branchId}:${productId}`;
}
async function assertActiveActor(userId, storeId) {
    const actor = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, storeId: true, isActive: true },
    });
    if (!actor || !actor.isActive || actor.storeId !== storeId) {
        throw new AppError_1.AppError(401, "Unauthorized");
    }
}
async function assertStockInTargets(items, storeId) {
    const branchIds = [...new Set(items.map((item) => item.branchId))];
    const productIds = [...new Set(items.map((item) => item.dto.productId))];
    const [branches, products] = await Promise.all([
        prisma_1.prisma.branch.findMany({
            where: { id: { in: branchIds }, storeId },
            select: { id: true },
        }),
        prisma_1.prisma.product.findMany({
            where: { id: { in: productIds }, storeId },
            select: { id: true, isActive: true },
        }),
    ]);
    const foundBranchIds = new Set(branches.map((branch) => branch.id));
    const productById = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
        if (!foundBranchIds.has(item.branchId)) {
            throw new AppError_1.AppError(404, "Branch not found");
        }
        const product = productById.get(item.dto.productId);
        if (!product) {
            throw new AppError_1.AppError(404, "Product not found");
        }
        if (!product.isActive) {
            throw new AppError_1.AppError(409, "Cannot stock an inactive product");
        }
    }
}
async function createStockInEntry(item, createdById, tx) {
    const batch = await inventory_repository_1.InventoryRepository.createBatch({
        branchId: item.branchId,
        storeId: item.storeId,
        productId: item.dto.productId,
        initialQty: item.dto.quantity,
        remainingQty: item.dto.quantity,
        costPriceUzs: item.dto.costPriceUzs,
        costPriceUsd: item.dto.costPriceUsd,
        supplierNote: item.dto.supplierNote,
        createdById,
    }, tx);
    const availableQty = await inventory_repository_1.InventoryRepository.sumRemainingQty(item.storeId, item.branchId, item.dto.productId, tx);
    const updatedInventory = await inventory_repository_1.InventoryRepository.setBalance(item.storeId, item.branchId, item.dto.productId, availableQty, tx);
    await inventory_repository_1.InventoryRepository.createMovement({
        branchId: item.branchId,
        storeId: item.storeId,
        productId: item.dto.productId,
        type: client_1.StockMovementType.STOCK_IN,
        quantity: item.dto.quantity,
        balanceAfter: Number(updatedInventory.quantity),
        note: item.dto.supplierNote,
        createdById,
    }, tx);
    return batch;
}
exports.InventoryService = {
    // ─── Stock In ─────────────────────────────────────────────────────────────
    async stockIn(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        const item = { dto, storeId, branchId };
        await Promise.all([
            assertActiveActor(user.id, storeId),
            assertStockInTargets([item], storeId),
        ]);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            return createStockInEntry(item, user.id, tx);
        }, prisma_1.transactionOptions);
    },
    async stockInBatch(dtos, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const items = dtos.map((dto) => ({
            dto,
            storeId,
            branchId: (0, branch_access_1.resolveBranchId)(dto.branchId, user),
        }));
        await Promise.all([
            assertActiveActor(user.id, storeId),
            assertStockInTargets(items, storeId),
        ]);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const receiptId = (0, crypto_1.randomUUID)();
            const batchIds = items.map(() => (0, crypto_1.randomUUID)());
            const balanceIncrements = new Map();
            items.forEach((item) => {
                const key = stockInKey(item.branchId, item.dto.productId);
                const current = balanceIncrements.get(key);
                if (current) {
                    current.quantity = Number((current.quantity + item.dto.quantity).toFixed(4));
                }
                else {
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
            const updatedBalances = await inventory_repository_1.InventoryRepository.incrementBalances([...balanceIncrements.values()], tx);
            const finalBalanceByKey = new Map(updatedBalances.map((row) => [
                stockInKey(row.branchId, row.productId),
                Number(row.quantity),
            ]));
            const laterQuantityByKey = new Map();
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
                    type: client_1.StockMovementType.STOCK_IN,
                    quantity: item.dto.quantity,
                    balanceAfter,
                    note: item.dto.supplierNote,
                    createdById: user.id,
                };
                laterQuantityByKey.set(key, Number((laterQuantity + item.dto.quantity).toFixed(4)));
            }
            await tx.stockMovement.createMany({ data: movements });
            const batches = await inventory_repository_1.InventoryRepository.findBatchesByIds(batchIds, tx);
            const batchById = new Map(batches.map((batch) => [batch.id, batch]));
            return batchIds
                .map((id) => batchById.get(id))
                .filter((batch) => Boolean(batch));
        }, prisma_1.transactionOptions);
    },
    // ─── Manual Adjustment ───────────────────────────────────────────────────
    async adjust(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        await Promise.all([
            (0, branch_access_1.assertBranchesInStore)([branchId], storeId),
            (0, branch_access_1.assertProductsInStore)([dto.productId], storeId),
        ]);
        const current = await inventory_repository_1.InventoryRepository.findOne(storeId, branchId, dto.productId);
        const currentQty = current ? Number(current.quantity) : 0;
        const delta = dto.newQuantity - currentQty;
        if (delta === 0) {
            throw new AppError_1.AppError(400, "New quantity is the same as current stock — no adjustment needed");
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const updatedInventory = await inventory_repository_1.InventoryRepository.upsertBalance(storeId, branchId, dto.productId, delta, tx);
            const movement = await inventory_repository_1.InventoryRepository.createMovement({
                storeId,
                branchId,
                productId: dto.productId,
                type: client_1.StockMovementType.ADJUSTMENT,
                quantity: delta,
                balanceAfter: Number(updatedInventory.quantity),
                note: dto.reason,
                createdById: user.id,
            }, tx);
            return {
                previousQuantity: currentQty,
                newQuantity: dto.newQuantity,
                delta,
                movement,
            };
        }, prisma_1.transactionOptions);
    },
    // ─── Read Operations ─────────────────────────────────────────────────────
    async findAll(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const records = await inventory_repository_1.InventoryRepository.findAll({
            ...scope,
            productId: query.productId,
            categoryId: query.categoryId,
        });
        if (!query.lowStock)
            return records;
        return records.filter((inv) => {
            const threshold = inv.product.lowStockThreshold;
            if (threshold === null)
                return false;
            return Number(inv.quantity) <= Number(threshold);
        });
    },
    async findMovements(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return inventory_repository_1.InventoryRepository.findMovements({
            ...scope,
            productId: query.productId,
            type: query.type,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },
    async findBatches(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return inventory_repository_1.InventoryRepository.findBatches({
            ...scope,
            productId: query.productId,
            depleted: query.depleted,
            from: query.from,
            to: query.to,
        });
    },
    async findBatchesSummary(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const [totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs] = await Promise.all([
            inventory_repository_1.InventoryRepository.countBatches({ storeId: scope.storeId, branchId: scope.branchId }),
            inventory_repository_1.InventoryRepository.countBatches({ storeId: scope.storeId, branchId: scope.branchId, depleted: false }),
            inventory_repository_1.InventoryRepository.sumBatchCostUzs(scope.storeId, scope.branchId),
            inventory_repository_1.InventoryRepository.sumRemainingValueUzs(scope.storeId, scope.branchId),
        ]);
        return { totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs };
    },
    async findBatchesPaginated(query, page, pageSize, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const filters = {
            ...scope,
            productId: query.productId,
            depleted: query.depleted,
            from: query.from,
            to: query.to,
        };
        const [items, total, totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs] = await Promise.all([
            inventory_repository_1.InventoryRepository.findBatchesPaginated(filters, page, pageSize),
            inventory_repository_1.InventoryRepository.countBatches(filters),
            inventory_repository_1.InventoryRepository.countBatches({ storeId: scope.storeId, branchId: scope.branchId }),
            inventory_repository_1.InventoryRepository.countBatches({ storeId: scope.storeId, branchId: scope.branchId, depleted: false }),
            inventory_repository_1.InventoryRepository.sumBatchCostUzs(scope.storeId, scope.branchId),
            inventory_repository_1.InventoryRepository.sumRemainingValueUzs(scope.storeId, scope.branchId),
        ]);
        return { items, total, totalBatches, totalActive, totalCostUzs, totalRemainingValueUzs };
    },
    async findReceiptsPaginated(query, page, pageSize, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const result = await inventory_repository_1.InventoryRepository.findReceiptsPaginated({ ...scope, from: query.from, to: query.to }, page, pageSize);
        return {
            total: result.total,
            items: result.items.map((item) => ({
                id: item.id,
                receivedAt: item.receivedAt,
                productCount: item.productCount,
                pieceQuantity: Number(item.pieceQuantity),
                kgQuantity: Number(item.kgQuantity),
                totalCostUzs: Number(item.totalCostUzs),
                remainingValueUzs: Number(item.remainingValueUzs),
                supplierNote: item.supplierNote,
                branch: { id: item.branchId, name: item.branchName },
                createdBy: { id: item.createdById, fullName: item.createdByName },
            })),
        };
    },
    async findReceiptItems(receiptId, page, pageSize, user) {
        const scope = (0, branch_access_1.branchScope)(user);
        return inventory_repository_1.InventoryRepository.findReceiptItems({ ...scope, receiptId }, page, pageSize);
    },
    // ─── Internal: FIFO deduction ─────────────────────────────────────────────
    // Called by SalesService (STOCK_OUT) and TransfersService (TRANSFER_OUT).
    // movementType lets the caller control what gets logged in StockMovement.
    async deductStock(storeId, branchId, productId, quantity, createdById, note, tx, movementType = client_1.StockMovementType.STOCK_OUT) {
        const batches = await inventory_repository_1.InventoryRepository.findActiveBatches(storeId, branchId, productId, tx);
        const currentQty = batches.reduce((sum, batch) => sum + Number(batch.remainingQty), 0);
        if (currentQty < quantity) {
            const productRecord = await tx.product.findFirst({
                where: { id: productId, storeId },
                select: { name: true },
            });
            throw new AppError_1.AppError(409, `Insufficient stock for "${productRecord?.name}": available ${currentQty}, requested ${quantity}`);
        }
        // FIFO: consume from oldest batches first
        let remaining = quantity;
        const allocations = [];
        for (const batch of batches) {
            if (remaining <= 0)
                break;
            const consume = Math.min(Number(batch.remainingQty), remaining);
            await inventory_repository_1.InventoryRepository.decrementBatch(batch.id, consume, tx);
            allocations.push({ stockBatchId: batch.id, quantity: consume });
            remaining -= consume;
        }
        const nextQty = Number(Math.max(0, currentQty - quantity).toFixed(4));
        const updated = await inventory_repository_1.InventoryRepository.setBalance(storeId, branchId, productId, nextQty, tx);
        await inventory_repository_1.InventoryRepository.createMovement({
            storeId,
            branchId,
            productId,
            type: movementType,
            quantity: -quantity,
            balanceAfter: Number(updated.quantity),
            note,
            createdById,
        }, tx);
        return { balance: Number(updated.quantity), allocations };
    },
    async restoreTransferStock(storeId, branchId, productId, allocations, createdById, note, tx) {
        const quantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        for (const allocation of allocations) {
            await tx.stockBatch.update({
                where: { id: allocation.stockBatchId },
                data: { remainingQty: { increment: allocation.quantity } },
            });
        }
        const availableQty = await inventory_repository_1.InventoryRepository.sumRemainingQty(storeId, branchId, productId, tx);
        const updated = await inventory_repository_1.InventoryRepository.setBalance(storeId, branchId, productId, availableQty, tx);
        await inventory_repository_1.InventoryRepository.createMovement({
            storeId,
            branchId,
            productId,
            type: client_1.StockMovementType.TRANSFER_IN,
            quantity,
            balanceAfter: Number(updated.quantity),
            note,
            createdById,
        }, tx);
        return Number(updated.quantity);
    },
    // ─── Internal: Transfer-in (called by TransfersService) ──────────────────
    // Creates a new StockBatch at the destination branch so cost price
    // is preserved for future FIFO deductions and COGS calculations.
    async transferIn(storeId, branchId, productId, quantity, costPriceUzs, note, createdById, tx) {
        await inventory_repository_1.InventoryRepository.createBatch({
            storeId,
            branchId,
            productId,
            initialQty: quantity,
            remainingQty: quantity,
            costPriceUzs,
            supplierNote: note,
            createdById,
        }, tx);
        const availableQty = await inventory_repository_1.InventoryRepository.sumRemainingQty(storeId, branchId, productId, tx);
        const updated = await inventory_repository_1.InventoryRepository.setBalance(storeId, branchId, productId, availableQty, tx);
        await inventory_repository_1.InventoryRepository.createMovement({
            storeId,
            branchId,
            productId,
            type: client_1.StockMovementType.TRANSFER_IN,
            quantity,
            balanceAfter: Number(updated.quantity),
            note,
            createdById,
        }, tx);
        return Number(updated.quantity);
    },
};
