import { z } from "zod";
import { Prisma, StockMovementType } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, requireStoreId, resolveBranchId } from "../../../core/utils/branch-access";
import { isBranchScopedRole } from "../../../core/utils/role-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { emitTransferChanged } from "../../../infrastructure/socket";
import { InventoryService } from "../../inventory/services/inventory.service";
import { CreateTransferDto } from "../dto/create-transfer.dto";
import { TransfersRepository } from "../repositories/transfers.repository";
import { transferQuerySchema } from "../validations/transfer.validation";

export const TransfersService = {
    // ─── Create (PENDING) ─────────────────────────────────────────────────────

    async create(dto: CreateTransferDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const fromBranchId = resolveBranchId(dto.fromBranchId, user);

        if (fromBranchId === dto.toBranchId) {
            throw new AppError(400, "Source and destination branch must be different");
        }

        // Validate both branches exist
        const [fromBranch, toBranch] = await Promise.all([
            prisma.branch.findFirst({ where: { id: fromBranchId, storeId }, select: { id: true, name: true } }),
            prisma.branch.findFirst({ where: { id: dto.toBranchId, storeId }, select: { id: true, name: true } }),
        ]);
        if (!fromBranch) throw new AppError(404, "Source branch not found");
        if (!toBranch) throw new AppError(404, "Destination branch not found");

        // Load all products in one query
        const productIds = dto.items.map((i) => i.productId);
        const products = await prisma.product.findMany({
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

        const created = await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const transfer = await TransfersRepository.create({
                storeId,
                fromBranchId,
                toBranchId: dto.toBranchId,
                note: dto.note,
                initiatedById: user.id,
                items,
            }, tx);

            for (const item of transfer.items) {
                const reserved = await InventoryService.deductStock(
                    storeId,
                    fromBranchId,
                    item.product.id,
                    Number(item.quantity),
                    user.id,
                    `Transfer ${transfer.id} reserved → ${toBranch.name}`,
                    tx,
                    StockMovementType.TRANSFER_OUT
                );
                await tx.transferAllocation.createMany({
                    data: reserved.allocations.map((allocation) => ({
                        transferItemId: item.id,
                        stockBatchId: allocation.stockBatchId,
                        quantity: allocation.quantity,
                    })),
                });
            }

            return transfer;
        }, { ...transactionOptions, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        emitTransferChanged({
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

    async complete(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const transfer = await TransfersRepository.findById(id, storeId);
        if (!transfer) throw new AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError(409, `Transfer is already ${transfer.status.toLowerCase()}`);
        }
        if (!isBranchScopedRole(user.role)) {
            throw new AppError(403, "Only the receiving branch can confirm this transfer");
        }
        if (
            transfer.toBranch.id !== user.branchId
        ) {
            throw new AppError(403, "Only the receiving branch can confirm this transfer");
        }

        const completed = await prisma.$transaction(
            async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId);
                const claimed = await tx.transfer.updateMany({
                    where: { id, storeId, status: "PENDING" },
                    data: { updatedAt: new Date() },
                });
                if (claimed.count !== 1) throw new AppError(409, "Transfer is no longer pending");

                for (const item of transfer.items) {
                    const qty = Number(item.quantity);
                    const cost = Number(item.unitCostUzs);

                    const reservationCount = await tx.transferAllocation.count({
                        where: { transferItemId: item.id },
                    });
                    // Legacy pending transfers were created before reservation support.
                    if (reservationCount === 0) {
                        await InventoryService.deductStock(
                            storeId,
                            transfer.fromBranch.id,
                            item.product.id,
                            qty,
                            user.id,
                            `Transfer ${id} → ${transfer.toBranch.name}`,
                            tx,
                            StockMovementType.TRANSFER_OUT
                        );
                    }

                    // Source was already reserved at creation; confirmation only receives it.
                    await InventoryService.transferIn(
                        storeId,
                        transfer.toBranch.id,
                        item.product.id,
                        qty,
                        cost,
                        transfer.fromBranch.name,
                        user.id,
                        tx
                    );
                }

                return TransfersRepository.updateStatus(id, "COMPLETED", user.id, tx);
            },
            { ...transactionOptions, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
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
            await assertStoreWritableInTransaction(tx, storeId);
            const claimed = await tx.transfer.updateMany({
                where: { id, storeId, status: "PENDING" },
                data: { updatedAt: new Date() },
            });
            if (claimed.count !== 1) throw new AppError(409, "Transfer is no longer pending");
            const allocations = await tx.transferAllocation.findMany({
                where: { transferItem: { transferId: id } },
                select: {
                    stockBatchId: true,
                    quantity: true,
                    transferItem: { select: { productId: true } },
                },
            });
            const byProduct = new Map<string, Array<{ stockBatchId: string; quantity: number }>>();
            for (const allocation of allocations) {
                const productAllocations = byProduct.get(allocation.transferItem.productId) ?? [];
                productAllocations.push({
                    stockBatchId: allocation.stockBatchId,
                    quantity: Number(allocation.quantity),
                });
                byProduct.set(allocation.transferItem.productId, productAllocations);
            }
            for (const [productId, productAllocations] of byProduct) {
                await InventoryService.restoreTransferStock(
                    storeId,
                    transfer.fromBranch.id,
                    productId,
                    productAllocations,
                    user.id,
                    `Cancelled transfer ${id}`,
                    tx
                );
            }
            return TransfersRepository.updateStatus(id, "CANCELLED", null, tx);
        }, { ...transactionOptions, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
