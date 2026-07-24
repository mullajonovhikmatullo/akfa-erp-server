"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const customerSelect = {
    id: true,
    storeId: true,
    fullName: true,
    phone: true,
    address: true,
    balance: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
};
exports.CustomersRepository = {
    create(data) {
        return prisma_1.prisma.customer.create({ data, select: customerSelect });
    },
    findAll(filters) {
        return prisma_1.prisma.customer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
                ...(filters.hasDebt && { balance: { gt: 0 } }),
                ...(filters.search && {
                    OR: [
                        { fullName: { contains: filters.search, mode: "insensitive" } },
                        { phone: { contains: filters.search, mode: "insensitive" } },
                    ],
                }),
            },
            select: customerSelect,
            orderBy: { createdAt: "desc" },
        });
    },
    findById(id, storeId) {
        return prisma_1.prisma.customer.findFirst({ where: { id, storeId }, select: customerSelect });
    },
    findByIdInBranch(id, branchId, storeId) {
        return prisma_1.prisma.customer.findFirst({
            where: { id, branchId, storeId },
            select: customerSelect,
        });
    },
    update(id, data) {
        return prisma_1.prisma.customer.update({ where: { id }, data, select: customerSelect });
    },
    adjustBalance(id, delta, tx) {
        return tx.customer.update({
            where: { id },
            data: { balance: { increment: delta } },
            select: { id: true, balance: true },
        });
    },
    recentSales(id, storeId, limit = 10) {
        return prisma_1.prisma.sale.findMany({
            where: { customerId: id, storeId },
            select: {
                id: true,
                saleType: true,
                totalAmountUzs: true,
                paidAmountUzs: true,
                debtAmountUzs: true,
                createdAt: true,
                _count: { select: { items: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    },
};
