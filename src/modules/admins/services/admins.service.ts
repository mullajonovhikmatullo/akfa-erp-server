import bcrypt from "bcrypt";
import { AuditAction } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { assertPlanCapacity } from "../../../core/services/plan-limit.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { assertBranchInStore, requireStoreId } from "../../../core/utils/branch-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import { CreateAdminDto } from "../dto/create-admin.dto";
import { UpdateAdminDto } from "../dto/update-admin.dto";
import { AdminsRepository } from "../repositories/admins.repository";

export const AdminsService = {
    async create(dto: CreateAdminDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        const hashedPassword = await bcrypt.hash(dto.password, 12);

        return prisma.$transaction(async (tx) => {
            await assertPlanCapacity(tx, storeId, "users");

            const [existingUser, branch] = await Promise.all([
                AdminsRepository.findByUsername(dto.username, tx),
                tx.branch.findFirst({ where: { id: dto.branchId, storeId }, select: { id: true } }),
            ]);

            if (existingUser) throw new AppError(409, "Username is already taken");
            if (!branch) throw new AppError(404, "Branch not found");

            const admin = await AdminsRepository.create({
                ...dto,
                password: hashedPassword,
                storeId,
            }, tx);

            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: AuditAction.ADMIN_CREATED,
                    metadata: {
                        adminId: admin.id,
                        branchId: admin.branchId,
                        role: admin.role,
                    },
                },
            });

            return admin;
        }, transactionOptions);
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
        if (!admin) throw new AppError(404, "Admin not found");
        return admin;
    },

    async update(id: string, dto: UpdateAdminDto, user: JwtPayload) {
        const storeId = requireStoreId(user);

        const result = await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const existing = await AdminsRepository.findById(id, storeId, tx);
            if (!existing) throw new AppError(404, "Admin not found");

            if (dto.branchId) {
                await assertBranchInStore(dto.branchId, storeId, tx);
            }

            const scopeChanged =
                dto.branchId !== undefined && dto.branchId !== existing.branchId;
            const admin = await AdminsRepository.update(
                id,
                storeId,
                {
                    ...dto,
                    ...(scopeChanged && { authVersion: { increment: 1 } }),
                },
                tx
            );
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: AuditAction.ADMIN_UPDATED,
                    metadata: {
                        adminId: id,
                        fromBranchId: existing.branchId,
                        toBranchId: admin.branchId,
                    },
                },
            });
            return { admin, scopeChanged };
        }, transactionOptions);

        if (result.scopeChanged) disconnectUserSockets(id);
        return result.admin;
    },

    async disable(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);

        const admin = await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            const existing = await AdminsRepository.findById(id, storeId, tx);
            if (!existing) throw new AppError(404, "Admin not found");
            if (!existing.isActive) return existing;

            const admin = await AdminsRepository.update(
                id,
                storeId,
                {
                    isActive: false,
                    authVersion: { increment: 1 },
                },
                tx
            );
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: AuditAction.ADMIN_DISABLED,
                    metadata: { adminId: id },
                },
            });
            return admin;
        }, transactionOptions);
        disconnectUserSockets(id);
        return admin;
    },

    async enable(id: string, user: JwtPayload) {
        const storeId = requireStoreId(user);

        return prisma.$transaction(async (tx) => {
            const existing = await AdminsRepository.findById(id, storeId, tx);
            if (!existing) throw new AppError(404, "Admin not found");
            if (existing.isActive) return existing;

            await assertPlanCapacity(tx, storeId, "users");
            const admin = await AdminsRepository.update(
                id,
                storeId,
                {
                    isActive: true,
                    authVersion: { increment: 1 },
                },
                tx
            );
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: AuditAction.ADMIN_ENABLED,
                    metadata: { adminId: id },
                },
            });
            return admin;
        }, transactionOptions);
    },

    async delete(id: string, user: JwtPayload) {
        return AdminsService.disable(id, user);
    },
};
