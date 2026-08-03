"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransfersService = void 0;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const role_access_1 = require("../../../core/utils/role-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const socket_1 = require("../../../infrastructure/socket");
const inventory_service_1 = require("../../inventory/services/inventory.service");
const transfers_repository_1 = require("../repositories/transfers.repository");
exports.TransfersService = {
    // ─── Create (PENDING) ─────────────────────────────────────────────────────
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const fromBranchId = (0, branch_access_1.resolveBranchId)(dto.fromBranchId, user);
        if (fromBranchId === dto.toBranchId) {
            throw new AppError_1.AppError(400, "Source and destination branch must be different");
        }
        // Validate both branches exist
        const [fromBranch, toBranch] = await Promise.all([
            prisma_1.prisma.branch.findFirst({ where: { id: fromBranchId, storeId }, select: { id: true, name: true } }),
            prisma_1.prisma.branch.findFirst({ where: { id: dto.toBranchId, storeId }, select: { id: true, name: true } }),
        ]);
        if (!fromBranch)
            throw new AppError_1.AppError(404, "Source branch not found");
        if (!toBranch)
            throw new AppError_1.AppError(404, "Destination branch not found");
        // Load all products in one query
        const productIds = dto.items.map((i) => i.productId);
        const products = await prisma_1.prisma.product.findMany({
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
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const transfer = await transfers_repository_1.TransfersRepository.create({
                storeId,
                fromBranchId,
                toBranchId: dto.toBranchId,
                note: dto.note,
                initiatedById: user.id,
                items,
            }, tx);
            for (const item of transfer.items) {
                const reserved = await inventory_service_1.InventoryService.deductStock(storeId, fromBranchId, item.product.id, Number(item.quantity), user.id, `Transfer ${transfer.id} reserved → ${toBranch.name}`, tx, client_1.StockMovementType.TRANSFER_OUT);
                await tx.transferAllocation.createMany({
                    data: reserved.allocations.map((allocation) => ({
                        transferItemId: item.id,
                        stockBatchId: allocation.stockBatchId,
                        quantity: allocation.quantity,
                    })),
                });
            }
            return transfer;
        }, { ...prisma_1.transactionOptions, isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
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
    // This is the moment stock actually moves. Everything in one transaction:
    //   • TRANSFER_OUT from source (FIFO deduction)
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
        if (!(0, role_access_1.isBranchScopedRole)(user.role)) {
            throw new AppError_1.AppError(403, "Only the receiving branch can confirm this transfer");
        }
        if (transfer.toBranch.id !== user.branchId) {
            throw new AppError_1.AppError(403, "Only the receiving branch can confirm this transfer");
        }
        const completed = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const claimed = await tx.transfer.updateMany({
                where: { id, storeId, status: "PENDING" },
                data: { updatedAt: new Date() },
            });
            if (claimed.count !== 1)
                throw new AppError_1.AppError(409, "Transfer is no longer pending");
            for (const item of transfer.items) {
                const qty = Number(item.quantity);
                const cost = Number(item.unitCostUzs);
                const reservationCount = await tx.transferAllocation.count({
                    where: { transferItemId: item.id },
                });
                // Legacy pending transfers were created before reservation support.
                if (reservationCount === 0) {
                    await inventory_service_1.InventoryService.deductStock(storeId, transfer.fromBranch.id, item.product.id, qty, user.id, `Transfer ${id} → ${transfer.toBranch.name}`, tx, client_1.StockMovementType.TRANSFER_OUT);
                }
                // Source was already reserved at creation; confirmation only receives it.
                await inventory_service_1.InventoryService.transferIn(storeId, transfer.toBranch.id, item.product.id, qty, cost, transfer.fromBranch.name, user.id, transfer.id, tx);
            }
            return transfers_repository_1.TransfersRepository.updateStatus(id, "COMPLETED", user.id, tx);
        }, { ...prisma_1.transactionOptions, isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
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
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const claimed = await tx.transfer.updateMany({
                where: { id, storeId, status: "PENDING" },
                data: { updatedAt: new Date() },
            });
            if (claimed.count !== 1)
                throw new AppError_1.AppError(409, "Transfer is no longer pending");
            const allocations = await tx.transferAllocation.findMany({
                where: { transferItem: { transferId: id } },
                select: {
                    stockBatchId: true,
                    quantity: true,
                    transferItem: { select: { productId: true } },
                },
            });
            const byProduct = new Map();
            for (const allocation of allocations) {
                const productAllocations = byProduct.get(allocation.transferItem.productId) ?? [];
                productAllocations.push({
                    stockBatchId: allocation.stockBatchId,
                    quantity: Number(allocation.quantity),
                });
                byProduct.set(allocation.transferItem.productId, productAllocations);
            }
            for (const [productId, productAllocations] of byProduct) {
                await inventory_service_1.InventoryService.restoreTransferStock(storeId, transfer.fromBranch.id, productId, productAllocations, user.id, `Cancelled transfer ${id}`, tx);
            }
            return transfers_repository_1.TransfersRepository.updateStatus(id, "CANCELLED", null, tx);
        }, { ...prisma_1.transactionOptions, isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
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
