"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const customerSelect = {
    id: true,
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
    findById(id) {
        return prisma_1.prisma.customer.findUnique({ where: { id }, select: customerSelect });
    },
    findByIdInBranch(id, branchId) {
        return prisma_1.prisma.customer.findFirst({
            where: { id, branchId },
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
    recentSales(id, limit = 10) {
        return prisma_1.prisma.sale.findMany({
            where: { customerId: id },
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
