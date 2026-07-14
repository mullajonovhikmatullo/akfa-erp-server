import { z } from "zod";
import { StockMovementType } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, resolveBranchId } from "../../../core/utils/branch-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { emitTransferChanged } from "../../../infrastructure/socket";
import { InventoryService } from "../../inventory/services/inventory.service";
import { CreateTransferDto } from "../dto/create-transfer.dto";
import { TransfersRepository } from "../repositories/transfers.repository";
import { transferQuerySchema } from "../validations/transfer.validation";

export const TransfersService = {
    // ─── Create (PENDING) ─────────────────────────────────────────────────────

    async create(dto: CreateTransferDto, user: JwtPayload) {
        const fromBranchId = resolveBranchId(dto.fromBranchId, user);

        if (fromBranchId === dto.toBranchId) {
            throw new AppError(400, "Source and destination branch must be different");
        }

        // Validate both branches exist
        const [fromBranch, toBranch] = await Promise.all([
            prisma.branch.findUnique({ where: { id: fromBranchId }, select: { id: true, name: true } }),
            prisma.branch.findUnique({ where: { id: dto.toBranchId }, select: { id: true, name: true } }),
        ]);
        if (!fromBranch) throw new AppError(404, "Source branch not found");
        if (!toBranch) throw new AppError(404, "Destination branch not found");

        // Load all products in one query
        const productIds = dto.items.map((i) => i.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
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

        const created = await TransfersRepository.create({
            fromBranchId,
            toBranchId: dto.toBranchId,
            note: dto.note,
            initiatedById: user.id,
            items,
        });

        emitTransferChanged({
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
        const transfer = await TransfersRepository.findById(id);
        if (!transfer) throw new AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError(409, `Transfer is already ${transfer.status.toLowerCase()}`);
        }
        if (user.role !== "ADMIN") {
            throw new AppError(403, "Only the receiving branch can confirm this transfer");
        }
        if (
            transfer.toBranch.id !== user.branchId
        ) {
            throw new AppError(403, "Only the receiving branch can confirm this transfer");
        }

        const completed = await prisma.$transaction(
            async (tx) => {
                for (const item of transfer.items) {
                    const qty = Number(item.quantity);
                    const cost = Number(item.unitCostUzs);

                    // 1. Deduct from source branch (TRANSFER_OUT + FIFO)
                    await InventoryService.deductStock(
                        transfer.fromBranch.id,
                        item.product.id,
                        qty,
                        user.id,
                        `Transfer ${id} → ${transfer.toBranch.name}`,
                        tx,
                        StockMovementType.TRANSFER_OUT
                    );

                    // 2. Add to destination branch (TRANSFER_IN + new batch)
                    await InventoryService.transferIn(
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
            transactionOptions
        );

        emitTransferChanged({
            transferId: completed.id,
            status: completed.status,
            fromBranchId: completed.fromBranch.id,
            toBranchId: completed.toBranch.id,
        });

        return completed;
    },

    // ─── Cancel ───────────────────────────────────────────────────────────────

    async cancel(id: string, user: JwtPayload) {
        const transfer = await TransfersRepository.findById(id);
        if (!transfer) throw new AppError(404, "Transfer not found");
        if (transfer.status !== "PENDING") {
            throw new AppError(409, `Only PENDING transfers can be cancelled`);
        }

        // ADMIN can cancel their own initiated transfers; SUPER_ADMIN can cancel any
        if (
            user.role === "ADMIN" &&
            transfer.initiatedBy.id !== user.id
        ) {
            throw new AppError(403, "You can only cancel transfers you initiated");
        }

        const cancelled = await prisma.$transaction((tx) =>
            TransfersRepository.updateStatus(id, "CANCELLED", null, tx),
            transactionOptions
        );

        emitTransferChanged({
            transferId: cancelled.id,
            status: cancelled.status,
            fromBranchId: cancelled.fromBranch.id,
            toBranchId: cancelled.toBranch.id,
        });

        return cancelled;
    },

    // ─── Queries ──────────────────────────────────────────────────────────────

    async findAll(query: z.infer<typeof transferQuerySchema>, user: JwtPayload) {
        // ADMIN sees transfers involving their branch (as source or destination)
        const branchId =
            user.role === "ADMIN"
                ? (user.branchId ?? undefined)
                : query.branchId;

        return TransfersRepository.findAll({
            branchId,
            status: query.status,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },

    async findById(id: string, user: JwtPayload) {
        const transfer = await TransfersRepository.findById(id);
        if (!transfer) throw new AppError(404, "Transfer not found");

        if (
            user.role === "ADMIN" &&
            transfer.fromBranch.id !== user.branchId &&
            transfer.toBranch.id !== user.branchId
        ) {
            throw new AppError(403, "Forbidden");
        }

        return transfer;
    },
};
