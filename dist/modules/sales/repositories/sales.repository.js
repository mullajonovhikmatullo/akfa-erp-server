"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
// ─── Select shapes ────────────────────────────────────────────────────────────
const saleListSelect = {
    id: true,
    storeId: true,
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
};
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
        orderBy: { createdAt: "asc" },
    },
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildWhere(filters) {
    return {
        storeId: filters.storeId,
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
    };
}
// ─── Repository ───────────────────────────────────────────────────────────────
exports.SalesRepository = {
    create(data, tx) {
        return tx.sale.create({
            data: {
                storeId: data.storeId,
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
                            paymentMethod: data.initialPayment.paymentMethod,
                            note: data.initialPayment.note,
                            receivedById: data.initialPayment.receivedById,
                        },
                    },
                }),
            },
            select: saleDetailSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.sale.findMany({
            where: buildWhere(filters),
            select: saleListSelect,
            orderBy: { createdAt: "desc" },
            take: filters.limit,
        });
    },
    findPaginated(filters, page, pageSize) {
        return prisma_1.prisma.sale.findMany({
            where: buildWhere(filters),
            select: saleListSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },
    count(filters) {
        return prisma_1.prisma.sale.count({ where: buildWhere(filters) });
    },
    countWithDebt(storeId, branchId) {
        return prisma_1.prisma.sale.count({
            where: {
                storeId,
                ...(branchId && { branchId }),
                debtAmountUzs: { gt: 0 },
            },
        });
    },
    findById(id, storeId) {
        return prisma_1.prisma.sale.findFirst({ where: { id, storeId }, select: saleDetailSelect });
    },
    findByIdInBranch(id, branchId, storeId) {
        return prisma_1.prisma.sale.findFirst({
            where: { id, branchId, storeId },
            select: saleDetailSelect,
        });
    },
    addPayment(data, tx) {
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
                        paymentMethod: data.paymentMethod,
                        note: data.note,
                        receivedById: data.receivedById,
                    },
                },
            },
            select: saleDetailSelect,
        });
    },
    setDeadline(id, debtDueDate) {
        return prisma_1.prisma.sale.update({
            where: { id },
            data: { debtDueDate },
            select: saleDetailSelect,
        });
    },
};
