import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateCustomerDto } from "../dto/create-customer.dto";
import { UpdateCustomerDto } from "../dto/update-customer.dto";

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
    search?: string;
    isActive?: boolean;
    hasDebt?: boolean;
};

type DbClient = typeof prisma | Prisma.TransactionClient;

export const CustomersRepository = {
    create(
        data: Omit<CreateCustomerDto, "branchId"> & { storeId: string; branchId: string; normalizedPhone?: string },
        client: DbClient = prisma
    ) {
        return client.customer.create({
            data: { ...data, branchLinks: { create: { branchId: data.branchId } } },
            select: customerSelect,
        });
    },

    findAll(filters: CustomerFilters) {
        return prisma.customer.findMany({
            where: {
                storeId: filters.storeId,
                ...(filters.branchId && { branchLinks: { some: { branchId: filters.branchId } } }),
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
            orderBy: { createdAt: "desc" },
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

    linkBranch(customerId: string, branchId: string, client: DbClient = prisma) {
        return client.customerBranch.upsert({
            where: { customerId_branchId: { customerId, branchId } },
            create: { customerId, branchId },
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

    recentSales(id: string, storeId: string, limit = 10) {
        return prisma.sale.findMany({
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
