import { z } from "zod";
import { Prisma, StockMovementType } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { claimIdempotency, completeIdempotency } from "../../../core/services/idempotency.service";
import { InventoryRepository } from "../../inventory/repositories/inventory.repository";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, requireAssignedBranchId, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { isBranchScopedRole } from "../../../core/utils/role-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { emitTransferChanged } from "../../../infrastructure/socket";
import { InventoryService } from "../../inventory/services/inventory.service";
import { CreateTransferDto } from "../dto/create-transfer.dto";
import { TransfersRepository } from "../repositories/transfers.repository";
import { transferQuerySchema } from "../validations/transfer.validation";

async function reservedItemIds(
    transferId: string, storeId: string,
    items: Array<{ id: string; quantity: Prisma.Decimal }>, tx: Prisma.TransactionClient
) {
    const reservations = await tx.transferAllocation.groupBy({
        by: ["transferItemId"],
        where: { transferItem: { transferId, transfer: { storeId } } },
        _sum: { quantity: true },
    });
    const quantities = new Map(reservations.map((row) => [row.transferItemId, row._sum.quantity]));
    for (const item of items) {
        const quantity = quantities.get(item.id);
        if (quantity && !quantity.equals(item.quantity)) {
            throw new AppError(409, "Transfer reservation is incomplete; reconcile inventory");
        }
    }
    return new Set(quantities.keys());
}

export const TransfersService = {
    // ─── Create (PENDING) ─────────────────────────────────────────────────────

    async create(dto: CreateTransferDto, user: JwtPayload, idempotencyKey?: string) {
        const storeId = requireStoreId(user);
        const fromBranchId = resolveBranchId(dto.fromBranchId, user);

        if (fromBranchId === dto.toBranchId) {
            throw new AppError(400, "Source and destination branch must be different");
        }

        const result = await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId, "shared");
            const claim = await claimIdempotency(tx, { storeId, userId: user.id, operation: "transfer" }, idempotencyKey, { dto, fromBranchId });
            if (claim?.replay) {
                const previous = await TransfersRepository.findById(claim.resourceIds[0], storeId, tx);
                if (!previous) throw new AppError(409, "Original transfer is unavailable");
                return { transfer: previous, replayed: true };
            }
            // Validate both branches in one query under the tenant guard.
            const branches = await tx.branch.findMany({
                where: { id: { in: [fromBranchId, dto.toBranchId] }, storeId },
                select: { id: true, name: true },
            });
            const fromBranch = branches.find((branch) => branch.id === fromBranchId);
            const toBranch = branches.find((branch) => branch.id === dto.toBranchId);
            if (!fromBranch) throw new AppError(404, "Source branch not found");
            if (!toBranch) throw new AppError(404, "Destination branch not found");

            // Load all products in one query
            const productIds = dto.items.map((i) => i.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, storeId },
                select: { id: true, name: true, isActive: true, wholesalePriceUzs: true, wholesalePriceUsd: true },
            });

            if (products.length !== productIds.length) {
                const found = new Set(products.map((p) => p.id));
                const missing = productIds.filter((id) => !found.has(id));
                throw new AppError(404, `Products not found: ${missing.join(", ")}`);
            }

            const productMap = new Map(products.map((p) => [p.id, p]));

            // Build items — default cost to wholesale price when not supplied
            const items = dto.items.map((item) => {
                const product = productMap.get(item.productId)!;
                const wholesalePriceUzs = Number(product.wholesalePriceUzs);
                const wholesalePriceUsd = product.wholesalePriceUsd == null ? null : Number(product.wholesalePriceUsd);
                if (item.unitCostUzs === undefined && wholesalePriceUzs <= 0 && wholesalePriceUsd) {
                    throw new AppError(400, `unitCostUzs is required when transferring USD-priced product "${product.name}"`);
                }
                const unitCostUzs = item.unitCostUzs ?? wholesalePriceUzs;
                return {
                    productId: item.productId,
                    quantity: item.quantity,
                    unitCostUzs,
                    totalCostUzs: Number((item.quantity * unitCostUzs).toFixed(2)),
                };
            });

            const transfer = await TransfersRepository.create({
                storeId,
                fromBranchId,
                toBranchId: dto.toBranchId,
                note: dto.note,
                initiatedById: user.id,
                items,
            }, tx);
            // Preserve the existing reservation model: PENDING transfers remove
            // source availability immediately and record the exact FIFO batches.
            await InventoryService.deductStockBatch(
                storeId, fromBranchId, items, user.id,
                `Transfer ${transfer.id} reserved → ${toBranch.name}`, tx, StockMovementType.TRANSFER_OUT,
                transfer.items.map((item) => ({ id: item.id, productId: item.product.id }))
            );
            await completeIdempotency(tx, claim, [transfer.id]);
            return { transfer, replayed: false };
        }, transactionOptions);

        const created = result.transfer;
        if (!result.replayed) emitTransferChanged({
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

    async complete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const transfer = await TransfersRepository.findById(id, storeId);
        if (!transfer) throw new AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError(409, `Transfer is already ${transfer.status.toLowerCase()}`);
        }
        if (transfer.toBranch.id !== requireAssignedBranchId(user)) {
            throw new AppError(403, "Only the receiving branch can confirm this transfer");
        }

        const completed = await prisma.$transaction(
            async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId, "shared");
                await TransfersRepository.claimPending(id, storeId, "COMPLETED", tx);
                await InventoryRepository.lockStock(storeId, transfer.items.flatMap((item) => [
                    { branchId: transfer.fromBranch.id, productId: item.product.id },
                    { branchId: transfer.toBranch.id, productId: item.product.id },
                ]), tx);
                const reserved = await reservedItemIds(id, storeId, transfer.items, tx);
                await InventoryService.deductStockBatch(
                    storeId, transfer.fromBranch.id,
                    transfer.items.filter((item) => !reserved.has(item.id))
                        .map((item) => ({ productId: item.product.id, quantity: Number(item.quantity) })),
                    user.id, `Transfer ${id} → ${transfer.toBranch.name}`, tx, StockMovementType.TRANSFER_OUT
                );

                await InventoryService.transferInBatch(
                    storeId, transfer.toBranch.id,
                    transfer.items.map((item) => ({ productId: item.product.id,
                        quantity: Number(item.quantity), costPriceUzs: Number(item.unitCostUzs) })),
                    transfer.fromBranch.name, user.id, tx, transfer.id
                );

                return TransfersRepository.updateStatus(id, "COMPLETED", user.id, tx);
            },
            transactionOptions
        );

        emitTransferChanged({
            storeId,
            transferId: completed.id,
            status: completed.status,
            fromBranchId: completed.fromBranch.id,
            toBranchId: completed.toBranch.id,
        });

        return completed;
    },

    // ─── Cancel ───────────────────────────────────────────────────────────────

    async cancel(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const transfer = await TransfersRepository.findById(id, storeId);
        if (!transfer) throw new AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError(409, `Only PENDING transfers can be cancelled`);
        }

        // ADMIN can cancel their own initiated transfers; STORE_OWNER can cancel any
        if (
            isBranchScopedRole(user.role) &&
            transfer.initiatedBy.id !== user.id
        ) {
            throw new AppError(403, "You can only cancel transfers you initiated");
        }

        const cancelled = await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId, "shared");
            await TransfersRepository.claimPending(id, storeId, "CANCELLED", tx);
            await InventoryRepository.lockStock(storeId, transfer.items.map((item) => ({
                branchId: transfer.fromBranch.id, productId: item.product.id,
            })), tx);
            const reserved = await reservedItemIds(id, storeId, transfer.items, tx);
            await InventoryService.restoreTransferStockBatch(
                storeId, transfer.fromBranch.id, id,
                transfer.items.filter((item) => reserved.has(item.id))
                    .map((item) => ({ productId: item.product.id, quantity: Number(item.quantity) })),
                user.id, `Cancelled transfer ${id}`, tx
            );
            return TransfersRepository.updateStatus(id, "CANCELLED", null, tx);
        }, transactionOptions);

        emitTransferChanged({
            storeId,
            transferId: cancelled.id,
            status: cancelled.status,
            fromBranchId: cancelled.fromBranch.id,
            toBranchId: cancelled.toBranch.id,
        });

        return cancelled;
    },

    // ─── Queries ──────────────────────────────────────────────────────────────

    async findAll(query: z.infer<typeof transferQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);

        return TransfersRepository.findAll({
            storeId: scope.storeId,
            branchId: scope.branchId,
            status: query.status,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const transfer = await TransfersRepository.findById(id, storeId);
        if (!transfer) throw new AppError(404, "Transfer not found");

        if (
            isBranchScopedRole(user.role) &&
            transfer.fromBranch.id !== user.branchId &&
            transfer.toBranch.id !== user.branchId
        ) {
            throw new AppError(403, "Forbidden");
        }

        return transfer;
    },
};
