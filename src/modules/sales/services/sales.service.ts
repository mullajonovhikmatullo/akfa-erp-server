import { z } from "zod";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope, resolveBranchId } from "../../../core/utils/branch-access";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { InventoryService } from "../../inventory/services/inventory.service";
import { CustomersRepository } from "../../customers/repositories/customers.repository";
import { CreateSaleDto } from "../dto/create-sale.dto";
import { AddPaymentDto } from "../dto/add-payment.dto";
import { SalesRepository } from "../repositories/sales.repository";
import { saleQuerySchema } from "../validations/sale.validation";

export const SalesService = {
    // ─── Create Sale ──────────────────────────────────────────────────────────

    async create(dto: CreateSaleDto, user: JwtPayload) {
        const branchId = resolveBranchId(dto.branchId, user);

        // ── Validate branch ──────────────────────────────────────────────────
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true },
        });
        if (!branch) throw new AppError(404, "Branch not found");

        // ── Validate customer (if provided) ──────────────────────────────────
        if (dto.customerId) {
            const customer = await CustomersRepository.findByIdInBranch(
                dto.customerId,
                branchId
            );
            if (!customer) throw new AppError(404, "Customer not found in this branch");
            if (!customer.isActive) throw new AppError(409, "Customer account is inactive");
        }

        // ── Load all products in one query (avoid N+1) ───────────────────────
        const productIds = dto.items.map((i) => i.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                name: true,
                isActive: true,
                retailPriceUzs: true,
                wholesalePriceUzs: true,
            },
        });

        // All requested products must exist and be active
        if (products.length !== productIds.length) {
            const foundIds = new Set(products.map((p) => p.id));
            const missing = productIds.filter((id) => !foundIds.has(id));
            throw new AppError(404, `Products not found: ${missing.join(", ")}`);
        }
        const inactiveProducts = products.filter((p) => !p.isActive);
        if (inactiveProducts.length > 0) {
            throw new AppError(
                409,
                `Inactive products cannot be sold: ${inactiveProducts.map((p) => p.name).join(", ")}`
            );
        }

        // ── Build line items with price snapshots ────────────────────────────
        const productMap = new Map(products.map((p) => [p.id, p]));
        const saleItems = dto.items.map((item) => {
            const product = productMap.get(item.productId)!;
            const unitPrice =
                dto.saleType === "RETAIL"
                    ? Number(product.retailPriceUzs)
                    : Number(product.wholesalePriceUzs);
            return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice,
                totalPrice: Number((item.quantity * unitPrice).toFixed(2)),
            };
        });

        // ── Calculate totals ─────────────────────────────────────────────────
        const totalAmountUzs = Number(
            saleItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)
        );
        const paidUzsEquivalent = Number(
            (
                dto.paidAmountUzs +
                dto.paidAmountUsd * (dto.usdToUzsRate ?? 0)
            ).toFixed(2)
        );
        const debtAmountUzs = Number(
            Math.max(0, totalAmountUzs - paidUzsEquivalent).toFixed(2)
        );

        // ── Debt requires a customer ─────────────────────────────────────────
        if (debtAmountUzs > 0 && !dto.customerId) {
            throw new AppError(
                400,
                "A customer must be specified for sales with outstanding debt"
            );
        }

        if (dto.debtDueDate && debtAmountUzs <= 0) {
            throw new AppError(400, "A debt deadline can only be set when there is outstanding debt");
        }

        // ── Atomic transaction ───────────────────────────────────────────────
        return prisma.$transaction(async (tx) => {
            // 1. Create sale + items + initial payment
            const sale = await SalesRepository.create(
                {
                    branchId,
                    customerId: dto.customerId,
                    soldById: user.id,
                    saleType: dto.saleType,
                    totalAmountUzs,
                    paidAmountUzs: paidUzsEquivalent,
                    debtAmountUzs,
                    debtDueDate: dto.debtDueDate ? new Date(dto.debtDueDate) : null,
                    note: dto.note,
                    items: saleItems,
                    ...(paidUzsEquivalent > 0 && {
                        initialPayment: {
                            amountUzs: dto.paidAmountUzs,
                            amountUsd: dto.paidAmountUsd,
                            usdToUzsRate: dto.usdToUzsRate,
                            paymentMethod: dto.paymentMethod,
                            receivedById: user.id,
                            note: dto.note,
                        },
                    }),
                },
                tx
            );

            // 2. FIFO inventory deduction for each line item
            for (const item of saleItems) {
                await InventoryService.deductStock(
                    branchId,
                    item.productId,
                    item.quantity,
                    user.id,
                    `Sale ${sale.id}`,
                    tx
                );
            }

            // 3. Update customer balance if debt exists
            if (dto.customerId && debtAmountUzs > 0) {
                await CustomersRepository.adjustBalance(dto.customerId, debtAmountUzs, tx);
            }

            return sale;
        });
    },

    // ─── Add Payment to Existing Sale ─────────────────────────────────────────

    async addPayment(saleId: string, dto: AddPaymentDto, user: JwtPayload) {
        const sale = await SalesRepository.findById(saleId);
        if (!sale) throw new AppError(404, "Sale not found");

        // Branch isolation check
        if (user.role === "ADMIN" && sale.branch.id !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        const currentDebt = Number(sale.debtAmountUzs);
        if (currentDebt <= 0) {
            throw new AppError(400, "This sale has no outstanding debt");
        }

        const paymentUzsEquivalent = Number(
            (dto.amountUzs + dto.amountUsd * (dto.usdToUzsRate ?? 0)).toFixed(2)
        );
        const newPaidAmountUzs = Number(
            (Number(sale.paidAmountUzs) + paymentUzsEquivalent).toFixed(2)
        );
        const newDebtAmountUzs = Number(
            Math.max(0, Number(sale.totalAmountUzs) - newPaidAmountUzs).toFixed(2)
        );
        const debtReduced = currentDebt - newDebtAmountUzs;

        return prisma.$transaction(async (tx) => {
            const updated = await SalesRepository.addPayment(
                {
                    saleId,
                    amountUzs: dto.amountUzs,
                    amountUsd: dto.amountUsd,
                    usdToUzsRate: dto.usdToUzsRate,
                    paymentMethod: dto.paymentMethod,
                    note: dto.note,
                    receivedById: user.id,
                    newPaidAmountUzs,
                    newDebtAmountUzs,
                },
                tx
            );

            // Reduce customer balance by however much debt was cleared
            if (sale.customer && debtReduced > 0) {
                await CustomersRepository.adjustBalance(sale.customer.id, -debtReduced, tx);
            }

            return updated;
        });
    },

    // ─── Queries ──────────────────────────────────────────────────────────────

    async findAll(query: z.infer<typeof saleQuerySchema>, user: JwtPayload) {
        const scope = branchScope(user, query.branchId);
        return SalesRepository.findAll({
            ...scope,
            customerId: query.customerId,
            saleType: query.saleType,
            hasDebt: query.hasDebt,
            overdue: query.overdue,
            from: query.from,
            to: query.to,
            limit: query.limit,
        });
    },

    async setDebtDeadline(saleId: string, debtDueDate: Date | null, user: JwtPayload) {
        const sale = await SalesRepository.findById(saleId);
        if (!sale) throw new AppError(404, "Sale not found");

        if (user.role === "ADMIN" && sale.branch.id !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        if (debtDueDate !== null && Number(sale.debtAmountUzs) <= 0) {
            throw new AppError(400, "Cannot set a deadline on a sale with no outstanding debt");
        }

        return SalesRepository.setDeadline(saleId, debtDueDate);
    },

    async findById(id: string, user: JwtPayload) {
        const sale = await SalesRepository.findById(id);
        if (!sale) throw new AppError(404, "Sale not found");

        if (user.role === "ADMIN" && sale.branch.id !== user.branchId) {
            throw new AppError(403, "Forbidden");
        }

        return sale;
    },
};
