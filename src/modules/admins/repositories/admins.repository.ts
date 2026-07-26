import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateAdminDto } from "../dto/create-admin.dto";
import { UpdateAdminDto } from "../dto/update-admin.dto";
import { Prisma } from "@prisma/client";

const adminSelect = {
    id: true,
    storeId: true,
    fullName: true,
    username: true,
    role: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
} as const;

const STORE_ADMIN_ROLES = ["ADMIN", "BRANCH_ADMIN", "STORE_ADMIN", "CASHIER"] as const;

type AdminFilters = { storeId: string; branchId?: string; isActive?: boolean };
type DbClient = typeof prisma | Prisma.TransactionClient;
type AdminUpdateData = UpdateAdminDto & {
    isActive?: boolean;
    authVersion?: Prisma.IntFieldUpdateOperationsInput;
};

export const AdminsRepository = {
    create(
        data: Omit<CreateAdminDto, "password"> & { password: string; storeId: string },
        client: DbClient = prisma
    ) {
        return client.user.create({
            data: { ...data, role: "BRANCH_ADMIN" },
            select: adminSelect,
        });
    },

    findAll(filters: AdminFilters) {
        return prisma.user.findMany({
            where: {
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
            select: adminSelect,
            orderBy: { createdAt: "desc" },
        });
    },

    findPaginated(filters: AdminFilters, page: number, pageSize: number) {
        return prisma.user.findMany({
            where: {
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
            select: adminSelect,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
    },

    count(filters: AdminFilters) {
        return prisma.user.count({
            where: {
                storeId: filters.storeId,
                role: { in: [...STORE_ADMIN_ROLES] },
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
        });
    },

    countAssigned(storeId: string) {
        return prisma.user.count({ where: { storeId, role: { in: [...STORE_ADMIN_ROLES] }, branchId: { not: null } } });
    },

    countUnassigned(storeId: string) {
        return prisma.user.count({ where: { storeId, role: { in: [...STORE_ADMIN_ROLES] }, branchId: null } });
    },

    findById(id: string, storeId: string, client: DbClient = prisma) {
        return client.user.findFirst({
            where: { id, storeId, role: { in: [...STORE_ADMIN_ROLES] } },
            select: adminSelect,
        });
    },

    findByUsername(username: string, client: DbClient = prisma) {
        return client.user.findUnique({
            where: { username },
            select: { id: true },
        });
    },

    update(id: string, storeId: string, data: AdminUpdateData, client: DbClient = prisma) {
        return client.user.update({
            where: { id, storeId },
            data,
            select: adminSelect,
        });
    },
};
