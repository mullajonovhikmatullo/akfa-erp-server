import bcrypt from "bcrypt";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, requireStoreId } from "../../../core/utils/branch-access";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateAdminDto } from "../dto/create-admin.dto";
import { UpdateAdminDto } from "../dto/update-admin.dto";
import { AdminsRepository } from "../repositories/admins.repository";

export const AdminsService = {
    async create(dto: CreateAdminDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const [existingUser, branch] = await Promise.all([
            AdminsRepository.findByUsername(dto.username),
            prisma.branch.findFirst({ where: { id: dto.branchId, storeId }, select: { id: true } }),
        ]);

        if (existingUser) {
            throw new AppError(409, "Username is already taken");
        }
        if (!branch) {
            throw new AppError(404, "Branch not found");
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);

        return AdminsRepository.create({
            ...dto,
            password: hashedPassword,
            storeId,
        });
    },

    async findAll(filters: { branchId?: string; isActive?: boolean }, user: JwtPayload) {
        const storeId = requireStoreId(user);
        if (filters.branchId) await assertBranchInStore(filters.branchId, storeId);
        return AdminsRepository.findAll({ ...filters, storeId });
    },

    async findPaginated(params: { branchId?: string; isActive?: boolean; page: number; pageSize: number }, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const { page, pageSize, ...filters } = params;
        if (filters.branchId) await assertBranchInStore(filters.branchId, storeId);
        const [items, total, totalAssigned, totalUnassigned] = await Promise.all([
            AdminsRepository.findPaginated({ ...filters, storeId }, page, pageSize),
            AdminsRepository.count({ ...filters, storeId }),
            AdminsRepository.countAssigned(storeId),
            AdminsRepository.countUnassigned(storeId),
        ]);
        return { items, total, totalAssigned, totalUnassigned };
    },

    async findById(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const admin = await AdminsRepository.findById(id, storeId);
        if (!admin) {
            throw new AppError(404, "Admin not found");
        }
        return admin;
    },

    async update(id: string, dto: UpdateAdminDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        await AdminsService.findById(id, user);

        if (dto.branchId) {
            const branch = await prisma.branch.findFirst({
                where: { id: dto.branchId, storeId },
                select: { id: true },
            });
            if (!branch) {
                throw new AppError(404, "Branch not found");
            }
        }

        return AdminsRepository.update(id, dto);
    },

    async disable(id: string, user: JwtPayload) {
        await AdminsService.findById(id, user);
        return AdminsRepository.update(id, { isActive: false });
    },

    async enable(id: string, user: JwtPayload) {
        await AdminsService.findById(id, user);
        return AdminsRepository.update(id, { isActive: true });
    },

    async delete(id: string, user: JwtPayload) {
        await AdminsService.findById(id, user);
        return AdminsRepository.delete(id);
    },
};
