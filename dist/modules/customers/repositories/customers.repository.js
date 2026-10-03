"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersRepository = void 0;
exports.customerBranchBalanceSql = customerBranchBalanceSql;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const pagination_1 = require("../../../core/utils/pagination");
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
// A customer's branch balance is the open sale debt from that branch, plus the
// non-sale remainder (opening balance) on the branch that registered them.
// Summed over every branch it equals Customer.balance.
function customerBranchBalanceSql(storeId, branchId, customerIds) {
    return client_1.Prisma.sql `
        SELECT c.id, c."fullName", c.phone, c."isActive",
            COALESCE(SUM(s."debtAmountUzs") FILTER (WHERE s."branchId" = ${branchId}), 0)
                + CASE WHEN c."branchId" = ${branchId} THEN c.balance - COALESCE(SUM(s."debtAmountUzs"), 0) ELSE 0 END
                AS balance
        FROM "Customer" c
        LEFT JOIN "Sale" s ON s."customerId" = c.id AND s."storeId" = c."storeId" AND s."debtAmountUzs" > 0
        WHERE c."storeId" = ${storeId}
            ${customerIds ? client_1.Prisma.sql `AND c.id IN (${client_1.Prisma.join(customerIds)})` : client_1.Prisma.empty}
        GROUP BY c.id
    `;
}
exports.CustomersRepository = {
    create(data, client = prisma_1.prisma) {
        return client.customer.create({
            data: { ...data, branchLinks: { create: { branchId: data.branchId, storeId: data.storeId } } },
            select: customerSelect,
        });
    },
    findAll(filters) {
        return prisma_1.prisma.customer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchLinks: { some: { branchId: filters.branchId } } }),
                ...(filters.ids && { id: { in: filters.ids } }),
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
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: filters.limit ?? pagination_1.DEFAULT_LIST_LIMIT,
            skip: filters.offset ?? 0,
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
    linkBranch(customerId, storeId, branchId, client = prisma_1.prisma) {
        return client.customerBranch.upsert({
            where: { customerId_branchId: { customerId, branchId } },
            create: { customerId, storeId, branchId },
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
    async branchBalances(storeId, branchId, customerIds, client = prisma_1.prisma) {
        if (customerIds.length === 0)
            return new Map();
        const rows = await client.$queryRaw(client_1.Prisma.sql `
            SELECT id, balance::text AS balance FROM (${customerBranchBalanceSql(storeId, branchId, customerIds)}) balances
        `);
        return new Map(rows.map((row) => [row.id, new client_1.Prisma.Decimal(row.balance)]));
    },
    async findBranchDebtorIds(storeId, branchId) {
        const rows = await prisma_1.prisma.$queryRaw(client_1.Prisma.sql `
            SELECT id FROM (${customerBranchBalanceSql(storeId, branchId)}) balances WHERE balance > 0
        `);
        return rows.map((row) => row.id);
    },
    async branchDebtSummary(storeId, branchId, activeOnly) {
        const [row] = await prisma_1.prisma.$queryRaw(client_1.Prisma.sql `
            SELECT COALESCE(SUM(balance), 0)::text AS total, COUNT(*)::bigint AS count
            FROM (${customerBranchBalanceSql(storeId, branchId)}) balances
            WHERE balance > 0 ${activeOnly ? client_1.Prisma.sql `AND "isActive" = true` : client_1.Prisma.empty}
        `);
        return { totalDebt: Number(row?.total ?? 0), debtorCount: Number(row?.count ?? 0) };
    },
    topBranchDebtors(storeId, branchId, limit) {
        return prisma_1.prisma.$queryRaw(client_1.Prisma.sql `
            SELECT id, "fullName", phone, balance::text AS balance
            FROM (${customerBranchBalanceSql(storeId, branchId)}) balances
            WHERE balance > 0 AND "isActive" = true
            ORDER BY balance DESC, id ASC
            LIMIT ${limit}
        `);
    },
    recentSales(id, storeId, limit = 10, branchId) {
        return prisma_1.prisma.sale.findMany({
            where: { customerId: id, storeId, ...(branchId && { branchId }) },
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
