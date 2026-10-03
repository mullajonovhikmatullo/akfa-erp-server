import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";
import { DEFAULT_LIST_LIMIT } from "../../../core/utils/pagination";

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
} as const;

type CustomerFilters = {
    storeId: string;
    branchId?: string;
    ids?: string[];
    search?: string;
    isActive?: boolean;
    hasDebt?: boolean;
    limit?: number;
    offset?: number;
};

type DbClient = typeof prisma | Prisma.TransactionClient;

// A customer's branch balance is the open sale debt from that branch, plus the
// non-sale remainder (opening balance) on the branch that registered them.
// Summed over every branch it equals Customer.balance.
export function customerBranchBalanceSql(storeId: string, branchId: string, customerIds?: string[]) {
    return Prisma.sql`
        SELECT c.id, c."fullName", c.phone, c."isActive",
            COALESCE(SUM(s."debtAmountUzs") FILTER (WHERE s."branchId" = ${branchId}), 0)
                + CASE WHEN c."branchId" = ${branchId} THEN c.balance - COALESCE(SUM(s."debtAmountUzs"), 0) ELSE 0 END
                AS balance
        FROM "Customer" c
        LEFT JOIN "Sale" s ON s."customerId" = c.id AND s."storeId" = c."storeId" AND s."debtAmountUzs" > 0
        WHERE c."storeId" = ${storeId}
            ${customerIds ? Prisma.sql`AND c.id IN (${Prisma.join(customerIds)})` : Prisma.empty}
        GROUP BY c.id
    `;
}

export const CustomersRepository = {
    create(
        data: Omit<CreateCustomerDto, "branchId"> & { storeId: string; branchId: string; normalizedPhone?: string },
        client: DbClient = prisma
    ) {
        return client.customer.create({
            data: { ...data, branchLinks: { create: { branchId: data.branchId, storeId: data.storeId } } },
            select: customerSelect,
        });
    },

    findAll(filters: CustomerFilters) {
        return prisma.customer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchLinks: { some: { branchId: filters.branchId } } }),
                ...(filters.ids && { id: { in: filters.ids } }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
                ...(filters.hasDebt && { balance: { gt: 0 } }),
                ...(filters.search && {
                    OR: [
                        { fullName: { contains: filters.search, mode: "insensitive" as const } },
                        { phone: { contains: filters.search, mode: "insensitive" as const } },
                    ],
                }),
            },
            select: customerSelect,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: filters.limit ?? DEFAULT_LIST_LIMIT,
            skip: filters.offset ?? 0,
        });
    },

    findById(id: string, storeId: string, client: DbClient = prisma) {
        return client.customer.findFirst({ where: { id, storeId }, select: customerSelect });
    },

    findByIdInBranch(id: string, branchId: string, storeId: string) {
        return prisma.customer.findFirst({
            where: { id, storeId, branchLinks: { some: { branchId } } },
            select: customerSelect,
        });
    },

    findByNormalizedPhone(storeId: string, normalizedPhone: string, client: DbClient = prisma) {
        return client.customer.findUnique({
            where: { storeId_normalizedPhone: { storeId, normalizedPhone } },
            select: customerSelect,
        });
    },

    linkBranch(customerId: string, storeId: string, branchId: string, client: DbClient = prisma) {
        return client.customerBranch.upsert({
            where: { customerId_branchId: { customerId, branchId } },
            create: { customerId, storeId, branchId },
            update: {},
        });
    },

    update(id: string, storeId: string, data: UpdateCustomerDto, client: DbClient = prisma) {
        return client.customer.update({ where: { id, storeId }, data, select: customerSelect });
    },

    adjustBalance(id: string, storeId: string, delta: number, tx: Prisma.TransactionClient) {
        return tx.customer.update({
            where: { id, storeId },
            data: { balance: { increment: delta } },
            select: { id: true, balance: true },
        });
    },

    async branchBalances(storeId: string, branchId: string, customerIds: string[], client: DbClient = prisma) {
        if (customerIds.length === 0) return new Map<string, Prisma.Decimal>();
        const rows = await client.$queryRaw<Array<{ id: string; balance: string }>>(Prisma.sql`
            SELECT id, balance::text AS balance FROM (${customerBranchBalanceSql(storeId, branchId, customerIds)}) balances
        `);
        return new Map(rows.map((row) => [row.id, new Prisma.Decimal(row.balance)]));
    },

    async findBranchDebtorIds(storeId: string, branchId: string) {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id FROM (${customerBranchBalanceSql(storeId, branchId)}) balances WHERE balance > 0
        `);
        return rows.map((row) => row.id);
    },

    async branchDebtSummary(storeId: string, branchId: string, activeOnly: boolean) {
        const [row] = await prisma.$queryRaw<Array<{ total: string; count: bigint }>>(Prisma.sql`
            SELECT COALESCE(SUM(balance), 0)::text AS total, COUNT(*)::bigint AS count
            FROM (${customerBranchBalanceSql(storeId, branchId)}) balances
            WHERE balance > 0 ${activeOnly ? Prisma.sql`AND "isActive" = true` : Prisma.empty}
        `);
        return { totalDebt: Number(row?.total ?? 0), debtorCount: Number(row?.count ?? 0) };
    },

    topBranchDebtors(storeId: string, branchId: string, limit: number) {
        return prisma.$queryRaw<Array<{ id: string; fullName: string; phone: string | null; balance: string }>>(Prisma.sql`
            SELECT id, "fullName", phone, balance::text AS balance
            FROM (${customerBranchBalanceSql(storeId, branchId)}) balances
            WHERE balance > 0 AND "isActive" = true
            ORDER BY balance DESC, id ASC
            LIMIT ${limit}
        `);
    },

    recentSales(id: string, storeId: string, limit = 10, branchId?: string) {
        return prisma.sale.findMany({
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
