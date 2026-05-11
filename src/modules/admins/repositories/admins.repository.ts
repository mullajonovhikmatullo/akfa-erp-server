import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateAdminDto } from "../dto/create-admin.dto";
import { UpdateAdminDto } from "../dto/update-admin.dto";

const adminSelect = {
    id: true,
    fullName: true,
    username: true,
    role: true,
    isActive: true,
    branchId: true,
    branch: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
} as const;

export const AdminsRepository = {
    create(data: Omit<CreateAdminDto, "password"> & { password: string }) {
        return prisma.user.create({
            data: { ...data, role: "ADMIN" },
            select: adminSelect,
        });
    },

    findAll(filters: { branchId?: string; isActive?: boolean }) {
        return prisma.user.findMany({
            where: {
                role: "ADMIN",
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
            },
            select: adminSelect,
            orderBy: { createdAt: "desc" },
        });
    },

    findById(id: string) {
        return prisma.user.findFirst({
            where: { id, role: "ADMIN" },
            select: adminSelect,
        });
    },

    findByUsername(username: string) {
        return prisma.user.findUnique({
            where: { username },
            select: { id: true },
        });
    },

    update(id: string, data: UpdateAdminDto) {
        return prisma.user.update({
            where: { id },
            data,
            select: adminSelect,
        });
    },

    delete(id: string) {
        return prisma.user.delete({ where: { id } });
    },
};
