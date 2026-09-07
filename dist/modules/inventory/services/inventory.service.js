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
const idempotency_service_1 = require("../../../core/services/idempotency.service");
function stockInKey(branchId, productId) {
    return `${branchId}:${productId}`;
}
async function assertActiveActor(userId, storeId, tx) {
    const actor = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, storeId: true, isActive: true },
    });
    if (!actor || !actor.isActive || actor.storeId !== storeId) {
        throw new AppError_1.AppError(401, "Unauthorized");
    }
}
async function assertStockInTargets(items, storeId, tx) {
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
    const updatedInventory = await inventory_repository_1.InventoryRepository.upsertBalance(item.storeId, item.branchId, item.dto.productId, item.dto.quantity, tx);
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
    async stockIn(dto, user, idempotencyKey) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        const item = { dto, storeId, branchId };
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            const claim = await (0, idempotency_service_1.claimIdempotency)(tx, { storeId, userId: user.id, operation: "stock-in" }, idempotencyKey, { dto, branchId });
            if (claim?.replay) {
                const [previous] = await inventory_repository_1.InventoryRepository.findBatchesByIds(claim.resourceIds, storeId, tx);
                if (!previous)
                    throw new AppError_1.AppError(409, "Original stock-in result is unavailable");
                return previous;
            }
            await assertActiveActor(user.id, storeId, tx);
            await assertStockInTargets([item], storeId, tx);
            await inventory_repository_1.InventoryRepository.lockStock(storeId, [{ branchId, productId: dto.productId }], tx);
            const batch = await createStockInEntry(item, user.id, tx);
            await (0, idempotency_service_1.completeIdempotency)(tx, claim, [batch.id]);
            return batch;
        }, prisma_1.transactionOptions);
    },
    async stockInBatch(dtos, user, idempotencyKey) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const items = dtos.map((dto) => ({
            dto,
            storeId,
            branchId: (0, branch_access_1.resolveBranchId)(dto.branchId, user),
        }));
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            const claim = await (0, idempotency_service_1.claimIdempotency)(tx, { storeId, userId: user.id, operation: "stock-in-batch" }, idempotencyKey, items);
            if (claim?.replay) {
                const batches = await inventory_repository_1.InventoryRepository.findBatchesByIds(claim.resourceIds, storeId, tx);
                const byId = new Map(batches.map((batch) => [batch.id, batch]));
                return claim.resourceIds.map((id) => {
                    const batch = byId.get(id);
                    if (!batch)
                        throw new AppError_1.AppError(409, "Original stock-in result is unavailable");
                    return batch;
                });
            }
            await assertActiveActor(user.id, storeId, tx);
            await assertStockInTargets(items, storeId, tx);
            await inventory_repository_1.InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId: item.branchId, productId: item.dto.productId })), tx);
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
            const batches = await inventory_repository_1.InventoryRepository.findBatchesByIds(batchIds, storeId, tx);
            const batchById = new Map(batches.map((batch) => [batch.id, batch]));
            await (0, idempotency_service_1.completeIdempotency)(tx, claim, batchIds);
            return batchIds
                .map((id) => batchById.get(id))
                .filter((batch) => Boolean(batch));
        }, prisma_1.transactionOptions);
    },
    // ─── Manual Adjustment ───────────────────────────────────────────────────
    async adjust(dto, user, idempotencyKey) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const branchId = (0, branch_access_1.resolveBranchId)(dto.branchId, user);
        await Promise.all([
            (0, branch_access_1.assertBranchesInStore)([branchId], storeId),
            (0, branch_access_1.assertProductsInStore)([dto.productId], storeId),
        ]);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            const claim = await (0, idempotency_service_1.claimIdempotency)(tx, { storeId, userId: user.id, operation: "stock-adjustment" }, idempotencyKey, { dto, branchId });
            if (claim?.replay) {
                const movement = await inventory_repository_1.InventoryRepository.findMovement(claim.resourceIds[0], storeId, tx);
                if (!movement)
                    throw new AppError_1.AppError(409, "Original adjustment is unavailable");
                return {
                    previousQuantity: new client_1.Prisma.Decimal(movement.balanceAfter).minus(movement.quantity).toNumber(),
                    newQuantity: Number(movement.balanceAfter), delta: Number(movement.quantity), movement,
                };
            }
            await inventory_repository_1.InventoryRepository.lockStock(storeId, [{ branchId, productId: dto.productId }], tx);
            const current = await inventory_repository_1.InventoryRepository.findOne(storeId, branchId, dto.productId, tx);
            const currentQty = Number(current?.quantity ?? 0);
            const delta = new client_1.Prisma.Decimal(dto.newQuantity).minus(currentQty).toNumber();
            const batchQty = await inventory_repository_1.InventoryRepository.sumRemainingQty(storeId, branchId, dto.productId, tx);
            if (delta === 0 && new client_1.Prisma.Decimal(batchQty).equals(dto.newQuantity)) {
                throw new AppError_1.AppError(400, "New quantity is the same as current stock — no adjustment needed");
            }
            const batchDelta = new client_1.Prisma.Decimal(dto.newQuantity).minus(batchQty);
            if (batchDelta.isNegative()) {
                await inventory_repository_1.InventoryRepository.consumeBatches(storeId, branchId, [{ productId: dto.productId, quantity: batchDelta.abs().toNumber() }], tx);
            }
            else if (batchDelta.isPositive()) {
                const product = await tx.product.findFirstOrThrow({
                    where: { id: dto.productId, storeId },
                    select: { costPriceUzs: true, costPriceUsd: true },
                });
                await inventory_repository_1.InventoryRepository.createBatch({
                    storeId, branchId, productId: dto.productId,
                    initialQty: batchDelta.toNumber(), remainingQty: batchDelta.toNumber(),
                    costPriceUzs: Number(product.costPriceUzs),
                    costPriceUsd: product.costPriceUsd === null ? undefined : Number(product.costPriceUsd),
                    supplierNote: `Adjustment: ${dto.reason}`, createdById: user.id,
                }, tx);
            }
            const updatedInventory = await inventory_repository_1.InventoryRepository.setBalance(storeId, branchId, dto.productId, dto.newQuantity, tx);
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
            await (0, idempotency_service_1.completeIdempotency)(tx, claim, [movement.id]);
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
        return inventory_repository_1.InventoryRepository.findAll({
            ...scope,
            productId: query.productId,
            categoryId: query.categoryId,
            lowStock: query.lowStock,
            limit: query.limit,
            offset: query.offset,
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
            limit: query.limit,
            offset: query.offset,
        });
    },
    async findBatchesSummary(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return inventory_repository_1.InventoryRepository.batchesSummary(scope.storeId, scope.branchId);
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
        const hasFilters = query.productId || query.depleted !== undefined || query.from || query.to;
        const [items, summary, filteredTotal] = await Promise.all([
            inventory_repository_1.InventoryRepository.findBatchesPaginated(filters, page, pageSize),
            inventory_repository_1.InventoryRepository.batchesSummary(scope.storeId, scope.branchId),
            hasFilters ? inventory_repository_1.InventoryRepository.countBatches(filters) : Promise.resolve(null),
        ]);
        return { items, total: filteredTotal ?? summary.totalBatches, ...summary };
    },
    async findReceiptsPaginated(query, page, pageSize, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        const result = await inventory_repository_1.InventoryRepository.findReceiptsPaginated({ ...scope, from: query.from, to: query.to }, page, pageSize);
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
    async findReceiptItems(receiptId, page, pageSize, user) {
        return inventory_repository_1.InventoryRepository.findReceiptItems({ ...(0, branch_access_1.branchScope)(user), receiptId }, page, pageSize);
    },
    // ─── Internal: FIFO deduction ─────────────────────────────────────────────
    // Called by SalesService (STOCK_OUT) and TransfersService (TRANSFER_OUT).
    // movementType lets the caller control what gets logged in StockMovement.
    async deductStock(storeId, branchId, productId, quantity, createdById, note, tx, movementType = client_1.StockMovementType.STOCK_OUT) {
        const balances = await exports.InventoryService.deductStockBatch(storeId, branchId, [{ productId, quantity }], createdById, note, tx, movementType);
        return Number(balances[0].quantity);
    },
    async deductStockBatch(storeId, branchId, items, createdById, note, tx, movementType = client_1.StockMovementType.STOCK_OUT, transferItems) {
        if (items.length === 0)
            return [];
        await inventory_repository_1.InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        const balances = await inventory_repository_1.InventoryRepository.deductBalances(storeId, branchId, items, tx);
        await inventory_repository_1.InventoryRepository.consumeBatches(storeId, branchId, items, tx, transferItems);
        const byProduct = new Map(balances.map((row) => [row.productId, row.quantity]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, productId: item.productId, type: movementType,
                quantity: -item.quantity, balanceAfter: byProduct.get(item.productId), note, createdById,
            })),
        });
        return balances;
    },
    // ─── Internal: Transfer-in (called by TransfersService) ──────────────────
    // Creates a new StockBatch at the destination branch so cost price
    // is preserved for future FIFO deductions and COGS calculations.
    async restoreTransferStockBatch(storeId, branchId, transferId, items, createdById, note, tx) {
        if (items.length === 0)
            return;
        await inventory_repository_1.InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        const restored = await inventory_repository_1.InventoryRepository.restoreTransferBatches(storeId, branchId, transferId, tx);
        const byProduct = new Map(restored.map((row) => [row.productId, row.quantity]));
        if (restored.length !== items.length || items.some((item) => !new client_1.Prisma.Decimal(byProduct.get(item.productId) ?? 0).equals(item.quantity))) {
            throw new AppError_1.AppError(409, "Cannot restore transfer reservation; reconcile inventory");
        }
        const balances = await inventory_repository_1.InventoryRepository.incrementBalances(items.map((item) => ({
            storeId, branchId, ...item,
        })), tx);
        const balanceByProduct = new Map(balances.map((row) => [row.productId, String(row.quantity)]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, ...item, type: client_1.StockMovementType.TRANSFER_IN,
                balanceAfter: balanceByProduct.get(item.productId), note, createdById,
            })),
        });
    },
    async transferInBatch(storeId, branchId, items, note, createdById, tx, receiptId = (0, crypto_1.randomUUID)()) {
        await inventory_repository_1.InventoryRepository.lockStock(storeId, items.map((item) => ({ branchId, productId: item.productId })), tx);
        await tx.stockBatch.createMany({
            data: items.map((item) => ({
                receiptId, storeId, branchId, productId: item.productId, initialQty: item.quantity,
                remainingQty: item.quantity, costPriceUzs: item.costPriceUzs, supplierNote: note, createdById,
            })),
        });
        const balances = await inventory_repository_1.InventoryRepository.incrementBalances(items.map((item) => ({
            storeId, branchId, productId: item.productId, quantity: item.quantity,
        })), tx);
        const byProduct = new Map(balances.map((row) => [row.productId, String(row.quantity)]));
        await tx.stockMovement.createMany({
            data: items.map((item) => ({
                storeId, branchId, productId: item.productId, quantity: item.quantity,
                type: client_1.StockMovementType.TRANSFER_IN, balanceAfter: byProduct.get(item.productId), note, createdById,
            })),
        });
    },
    async transferIn(storeId, branchId, productId, quantity, costPriceUzs, note, createdById, tx) {
        await inventory_repository_1.InventoryRepository.lockStock(storeId, [{ branchId, productId }], tx);
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
        const updated = await inventory_repository_1.InventoryRepository.upsertBalance(storeId, branchId, productId, quantity, tx);
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
