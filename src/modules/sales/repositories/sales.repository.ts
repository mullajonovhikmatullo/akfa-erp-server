import { Prisma, SaleType } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";

// ─── Select shapes ────────────────────────────────────────────────────────────

const saleListSelect = {
    id: true,
    saleType: true,
    totalAmountUzs: true,
    paidAmountUzs: true,
    debtAmountUzs: true,
    debtDueDate: true,
    note: true,
    createdAt: true,
    branch: { select: { id: true, name: true } },
    customer: { select: { id: true, fullName: true, phone: true } },
    soldBy: { select: { id: true, fullName: true } },
    _count: { select: { items: true, payments: true } },
} as const;

const saleDetailSelect = {
    ...saleListSelect,
    items: {
        select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { id: true, name: true, sku: true, unit: true } },
        },
    },
    payments: {
        select: {
            id: true,
            amountUzs: true,
            amountUsd: true,
            usdToUzsRate: true,
            paymentMethod: true,
            note: true,
            createdAt: true,
            receivedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "asc" as const },
    },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type SaleFilters = {
    branchId?: string;
    customerId?: string;
    saleType?: SaleType;
    hasDebt?: boolean;
    overdue?: boolean;
    from?: string;
    to?: string;
    limit: number;
};

type CreateSaleData = {
    branchId: string;
    customerId?: string;
    soldById: string;
    saleType: SaleType;
    totalAmountUzs: number;
    paidAmountUzs: number;
    debtAmountUzs: number;
    debtDueDate?: Date | null;
    note?: string;
    items: {
        productId: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
    }[];
    initialPayment?: {
        amountUzs: number;
        amountUsd: number;
        usdToUzsRate?: number;
        paymentMethod: string;
        receivedById: string;
        note?: string;
    };
};

// ─── Repository ───────────────────────────────────────────────────────────────

export const SalesRepository = {
    create(data: CreateSaleData, tx: Prisma.TransactionClient) {
        return tx.sale.create({
            data: {
                branchId: data.branchId,
                customerId: data.customerId,
                soldById: data.soldById,
                saleType: data.saleType,
                totalAmountUzs: data.totalAmountUzs,
                paidAmountUzs: data.paidAmountUzs,
                debtAmountUzs: data.debtAmountUzs,
                debtDueDate: data.debtDueDate,
                note: data.note,
                items: {
                    createMany: { data: data.items },
                },
                ...(data.initialPayment && {
                    payments: {
                        create: {
                            amountUzs: data.initialPayment.amountUzs,
                            amountUsd: data.initialPayment.amountUsd,
                            usdToUzsRate: data.initialPayment.usdToUzsRate,
                            paymentMethod: data.initialPayment.paymentMethod as any,
                            note: data.initialPayment.note,
                            receivedById: data.initialPayment.receivedById,
                        },
                    },
                }),
            },
            select: saleDetailSelect,
        });
    },

    findAll(filters: SaleFilters) {
        return prisma.sale.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.customerId && { customerId: filters.customerId }),
                ...(filters.saleType && { saleType: filters.saleType }),
                ...(filters.hasDebt && { debtAmountUzs: { gt: 0 } }),
                ...(filters.overdue && {
                    debtAmountUzs: { gt: 0 },
                    debtDueDate: { lt: new Date(), not: null },
                }),
                ...((filters.from || filters.to) && {
                    createdAt: {
                        ...(filters.from && { gte: new Date(filters.from) }),
                        ...(filters.to && { lte: new Date(filters.to) }),
                    },
                }),
            },
            select: saleListSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },

    findById(id: string) {
        return prisma.sale.findUnique({ where: { id }, select: saleDetailSelect });
    },

    findByIdInBranch(id: string, branchId: string) {
        return prisma.sale.findFirst({
            where: { id, branchId },
            select: saleDetailSelect,
        });
    },

    addPayment(
        data: {
            saleId: string;
            amountUzs: number;
            amountUsd: number;
            usdToUzsRate?: number;
            paymentMethod: string;
            note?: string;
            receivedById: string;
            newPaidAmountUzs: number;
            newDebtAmountUzs: number;
        },
        tx: Prisma.TransactionClient
    ) {
        return tx.sale.update({
            where: { id: data.saleId },
            data: {
                paidAmountUzs: data.newPaidAmountUzs,
                debtAmountUzs: data.newDebtAmountUzs,
                payments: {
                    create: {
                        amountUzs: data.amountUzs,
                        amountUsd: data.amountUsd,
                        usdToUzsRate: data.usdToUzsRate,
                        paymentMethod: data.paymentMethod as any,
                        note: data.note,
                        receivedById: data.receivedById,
                    },
                },
            },
            select: saleDetailSelect,
        });
    },

    setDeadline(id: string, debtDueDate: Date | null) {
        return prisma.sale.update({
            where: { id },
            data: { debtDueDate },
            select: saleDetailSelect,
        });
    },
};
