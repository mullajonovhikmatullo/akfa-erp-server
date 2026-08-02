"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersRepository = void 0;
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const customerSelect = {
    id: true,
    storeId: true,
    fullName: true,
    phone: true,
    normalizedPhone: true,
    address: true,
    balance: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    branchLinks: { select: { branchId: true, branch: { select: { id: true, name: true } } } },
    createdAt: true,
    updatedAt: true,
};
exports.CustomersRepository = {
    create(data, client = prisma_1.prisma) {
        return client.customer.create({
            data: { ...data, branchLinks: { create: { branchId: data.branchId } } },
            select: customerSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.customer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchLinks: { some: { branchId: filters.branchId } } }),
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
    findById(id, storeId, client = prisma_1.prisma) {
        return client.customer.findFirst({ where: { id, storeId }, select: customerSelect });
    },
    findByIdInBranch(id, branchId, storeId) {
        return prisma_1.prisma.customer.findFirst({
            where: { id, storeId, branchLinks: { some: { branchId } } },
            select: customerSelect,
        });
    },
    findByNormalizedPhone(storeId, normalizedPhone, client = prisma_1.prisma) {
        return client.customer.findUnique({
            where: { storeId_normalizedPhone: { storeId, normalizedPhone } },
            select: customerSelect,
        });
    },
    linkBranch(customerId, branchId, client = prisma_1.prisma) {
        return client.customerBranch.upsert({
            where: { customerId_branchId: { customerId, branchId } },
            create: { customerId, branchId },
            update: {},
        });
    },
    update(id, storeId, data, client = prisma_1.prisma) {
        return client.customer.update({ where: { id, storeId }, data, select: customerSelect });
    },
    adjustBalance(id, storeId, delta, tx) {
        return tx.customer.update({
            where: { id, storeId },
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
