"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransfersService = void 0;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const idempotency_service_1 = require("../../../core/services/idempotency.service");
const inventory_repository_1 = require("../../inventory/repositories/inventory.repository");
const branch_access_1 = require("../../../core/utils/branch-access");
const role_access_1 = require("../../../core/utils/role-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const socket_1 = require("../../../infrastructure/socket");
const inventory_service_1 = require("../../inventory/services/inventory.service");
const transfers_repository_1 = require("../repositories/transfers.repository");
async function reservedItemIds(transferId, storeId, items, tx) {
    const reservations = await tx.transferAllocation.groupBy({
        by: ["transferItemId"],
        where: { transferItem: { transferId, transfer: { storeId } } },
        _sum: { quantity: true },
    });
    const quantities = new Map(reservations.map((row) => [row.transferItemId, row._sum.quantity]));
    for (const item of items) {
        const quantity = quantities.get(item.id);
        if (quantity && !quantity.equals(item.quantity)) {
            throw new AppError_1.AppError(409, "Transfer reservation is incomplete; reconcile inventory");
        }
    }
    return new Set(quantities.keys());
}
exports.TransfersService = {
    // ─── Create (PENDING) ─────────────────────────────────────────────────────
    async create(dto, user, idempotencyKey) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const fromBranchId = (0, branch_access_1.resolveBranchId)(dto.fromBranchId, user);
        if (fromBranchId === dto.toBranchId) {
            throw new AppError_1.AppError(400, "Source and destination branch must be different");
        }
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            const claim = await (0, idempotency_service_1.claimIdempotency)(tx, { storeId, userId: user.id, operation: "transfer" }, idempotencyKey, { dto, fromBranchId });
            if (claim?.replay) {
                const previous = await transfers_repository_1.TransfersRepository.findById(claim.resourceIds[0], storeId, tx);
                if (!previous)
                    throw new AppError_1.AppError(409, "Original transfer is unavailable");
                return { transfer: previous, replayed: true };
            }
            // Validate both branches in one query under the tenant guard.
            const branches = await tx.branch.findMany({
                where: { id: { in: [fromBranchId, dto.toBranchId] }, storeId },
                select: { id: true, name: true },
            });
            const fromBranch = branches.find((branch) => branch.id === fromBranchId);
            const toBranch = branches.find((branch) => branch.id === dto.toBranchId);
            if (!fromBranch)
                throw new AppError_1.AppError(404, "Source branch not found");
            if (!toBranch)
                throw new AppError_1.AppError(404, "Destination branch not found");
            // Load all products in one query
            const productIds = dto.items.map((i) => i.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, storeId },
                select: { id: true, name: true, isActive: true, wholesalePriceUzs: true, wholesalePriceUsd: true },
            });
            if (products.length !== productIds.length) {
                const found = new Set(products.map((p) => p.id));
                const missing = productIds.filter((id) => !found.has(id));
                throw new AppError_1.AppError(404, `Products not found: ${missing.join(", ")}`);
            }
            const productMap = new Map(products.map((p) => [p.id, p]));
            // Build items — default cost to wholesale price when not supplied
            const items = dto.items.map((item) => {
                const product = productMap.get(item.productId);
                const wholesalePriceUzs = Number(product.wholesalePriceUzs);
                const wholesalePriceUsd = product.wholesalePriceUsd == null ? null : Number(product.wholesalePriceUsd);
                if (item.unitCostUzs === undefined && wholesalePriceUzs <= 0 && wholesalePriceUsd) {
                    throw new AppError_1.AppError(400, `unitCostUzs is required when transferring USD-priced product "${product.name}"`);
                }
                const unitCostUzs = item.unitCostUzs ?? wholesalePriceUzs;
                return {
                    productId: item.productId,
                    quantity: item.quantity,
                    unitCostUzs,
                    totalCostUzs: Number((item.quantity * unitCostUzs).toFixed(2)),
                };
            });
            const transfer = await transfers_repository_1.TransfersRepository.create({
                storeId,
                fromBranchId,
                toBranchId: dto.toBranchId,
                note: dto.note,
                initiatedById: user.id,
                items,
            }, tx);
            // Preserve the existing reservation model: PENDING transfers remove
            // source availability immediately and record the exact FIFO batches.
            await inventory_service_1.InventoryService.deductStockBatch(storeId, fromBranchId, items, user.id, `Transfer ${transfer.id} reserved → ${toBranch.name}`, tx, client_1.StockMovementType.TRANSFER_OUT, transfer.items.map((item) => ({ id: item.id, productId: item.product.id })));
            await (0, idempotency_service_1.completeIdempotency)(tx, claim, [transfer.id]);
            return { transfer, replayed: false };
        }, prisma_1.transactionOptions);
        const created = result.transfer;
        if (!result.replayed)
            (0, socket_1.emitTransferChanged)({
                storeId,
                transferId: created.id,
                status: created.status,
                fromBranchId: created.fromBranch.id,
                toBranchId: created.toBranch.id,
            });
        return created;
    },
    // ─── Complete ─────────────────────────────────────────────────────────────
    // Source stock is reserved on creation. Everything below is one transaction:
    //   • TRANSFER_OUT only for legacy pending transfers without reservations
    //   • TRANSFER_IN to destination (new batch with transfer cost)
    //   • Transfer status → COMPLETED
    // NOT counted in sales figures — uses TRANSFER_OUT / TRANSFER_IN movement types.
    async complete(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const transfer = await transfers_repository_1.TransfersRepository.findById(id, storeId);
        if (!transfer)
            throw new AppError_1.AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError_1.AppError(409, `Transfer is already ${transfer.status.toLowerCase()}`);
        }
        if (transfer.toBranch.id !== (0, branch_access_1.requireAssignedBranchId)(user)) {
            throw new AppError_1.AppError(403, "Only the receiving branch can confirm this transfer");
        }
        const completed = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            await transfers_repository_1.TransfersRepository.claimPending(id, storeId, "COMPLETED", tx);
            await inventory_repository_1.InventoryRepository.lockStock(storeId, transfer.items.flatMap((item) => [
                { branchId: transfer.fromBranch.id, productId: item.product.id },
                { branchId: transfer.toBranch.id, productId: item.product.id },
            ]), tx);
            const reserved = await reservedItemIds(id, storeId, transfer.items, tx);
            await inventory_service_1.InventoryService.deductStockBatch(storeId, transfer.fromBranch.id, transfer.items.filter((item) => !reserved.has(item.id))
                .map((item) => ({ productId: item.product.id, quantity: Number(item.quantity) })), user.id, `Transfer ${id} → ${transfer.toBranch.name}`, tx, client_1.StockMovementType.TRANSFER_OUT);
            await inventory_service_1.InventoryService.transferInBatch(storeId, transfer.toBranch.id, transfer.items.map((item) => ({ productId: item.product.id,
                quantity: Number(item.quantity), costPriceUzs: Number(item.unitCostUzs) })), transfer.fromBranch.name, user.id, tx, transfer.id);
            return transfers_repository_1.TransfersRepository.updateStatus(id, storeId, "COMPLETED", user.id, tx);
        }, prisma_1.transactionOptions);
        (0, socket_1.emitTransferChanged)({
            storeId,
            transferId: completed.id,
            status: completed.status,
            fromBranchId: completed.fromBranch.id,
            toBranchId: completed.toBranch.id,
        });
        return completed;
    },
    // ─── Cancel ───────────────────────────────────────────────────────────────
    async cancel(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const transfer = await transfers_repository_1.TransfersRepository.findById(id, storeId);
        if (!transfer)
            throw new AppError_1.AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError_1.AppError(409, `Only PENDING transfers can be cancelled`);
        }
        // ADMIN can cancel their own initiated transfers; STORE_OWNER can cancel any
        if ((0, role_access_1.isBranchScopedRole)(user.role) &&
            transfer.initiatedBy.id !== user.id) {
            throw new AppError_1.AppError(403, "You can only cancel transfers you initiated");
        }
        const cancelled = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId, "shared");
            await transfers_repository_1.TransfersRepository.claimPending(id, storeId, "CANCELLED", tx);
            await inventory_repository_1.InventoryRepository.lockStock(storeId, transfer.items.map((item) => ({
                branchId: transfer.fromBranch.id, productId: item.product.id,
            })), tx);
            const reserved = await reservedItemIds(id, storeId, transfer.items, tx);
            await inventory_service_1.InventoryService.restoreTransferStockBatch(storeId, transfer.fromBranch.id, id, transfer.items.filter((item) => reserved.has(item.id))
                .map((item) => ({ productId: item.product.id, quantity: Number(item.quantity) })), user.id, `Cancelled transfer ${id}`, tx);
            return transfers_repository_1.TransfersRepository.updateStatus(id, storeId, "CANCELLED", null, tx);
        }, prisma_1.transactionOptions);
        (0, socket_1.emitTransferChanged)({
            storeId,
            transferId: cancelled.id,
            status: cancelled.status,
            fromBranchId: cancelled.fromBranch.id,
            toBranchId: cancelled.toBranch.id,
        });
        return cancelled;
    },
    // ─── Queries ──────────────────────────────────────────────────────────────
    async findAll(query, user) {
        const scope = (0, branch_access_1.branchScope)(user, query.branchId);
        return transfers_repository_1.TransfersRepository.findAll({
            storeId: scope.storeId,
            branchId: scope.branchId,
            status: query.status,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const transfer = await transfers_repository_1.TransfersRepository.findById(id, storeId);
        if (!transfer)
            throw new AppError_1.AppError(404, "Transfer not found");
        if ((0, role_access_1.isBranchScopedRole)(user.role) &&
            transfer.fromBranch.id !== user.branchId &&
            transfer.toBranch.id !== user.branchId) {
            throw new AppError_1.AppError(403, "Forbidden");
        }
        return transfer;
    },
};
