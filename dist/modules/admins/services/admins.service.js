"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const plan_limit_service_1 = require("../../../core/services/plan-limit.service");
const branch_access_1 = require("../../../core/utils/branch-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const socket_1 = require("../../../infrastructure/socket");
const admins_repository_1 = require("../repositories/admins.repository");
exports.AdminsService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const hashedPassword = await bcrypt_1.default.hash(dto.password, 12);
        return prisma_1.prisma.$transaction(async (tx) => {
            await (0, plan_limit_service_1.assertPlanCapacity)(tx, storeId, "users");
            const [existingUser, branch] = await Promise.all([
                admins_repository_1.AdminsRepository.findByUsername(dto.username, tx),
                tx.branch.findFirst({ where: { id: dto.branchId, storeId }, select: { id: true } }),
            ]);
            if (existingUser)
                throw new AppError_1.AppError(409, "Username is already taken");
            if (!branch)
                throw new AppError_1.AppError(404, "Branch not found");
            const admin = await admins_repository_1.AdminsRepository.create({
                ...dto,
                password: hashedPassword,
                storeId,
            }, tx);
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: client_1.AuditAction.ADMIN_CREATED,
                    metadata: {
                        adminId: admin.id,
                        branchId: admin.branchId,
                        role: admin.role,
                    },
                },
            });
            return admin;
        }, prisma_1.transactionOptions);
    },
    async findAll(filters, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        if (filters.branchId)
            await (0, branch_access_1.assertBranchInStore)(filters.branchId, storeId);
        return admins_repository_1.AdminsRepository.findAll({ ...filters, storeId });
    },
    async findPaginated(params, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const { page, pageSize, ...filters } = params;
        if (filters.branchId)
            await (0, branch_access_1.assertBranchInStore)(filters.branchId, storeId);
        const [items, total, totalAssigned, totalUnassigned] = await Promise.all([
            admins_repository_1.AdminsRepository.findPaginated({ ...filters, storeId }, page, pageSize),
            admins_repository_1.AdminsRepository.count({ ...filters, storeId }),
            admins_repository_1.AdminsRepository.countAssigned(storeId),
            admins_repository_1.AdminsRepository.countUnassigned(storeId),
        ]);
        return { items, total, totalAssigned, totalUnassigned };
    },
    async findById(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const admin = await admins_repository_1.AdminsRepository.findById(id, storeId);
        if (!admin)
            throw new AppError_1.AppError(404, "Admin not found");
        return admin;
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const existing = await admins_repository_1.AdminsRepository.findById(id, storeId, tx);
            if (!existing)
                throw new AppError_1.AppError(404, "Admin not found");
            if (dto.branchId) {
                await (0, branch_access_1.assertBranchInStore)(dto.branchId, storeId, tx);
            }
            const scopeChanged = dto.branchId !== undefined && dto.branchId !== existing.branchId;
            const admin = await admins_repository_1.AdminsRepository.update(id, storeId, {
                ...dto,
                ...(scopeChanged && { authVersion: { increment: 1 } }),
            }, tx);
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: client_1.AuditAction.ADMIN_UPDATED,
                    metadata: {
                        adminId: id,
                        fromBranchId: existing.branchId,
                        toBranchId: admin.branchId,
                    },
                },
            });
            return { admin, scopeChanged };
        }, prisma_1.transactionOptions);
        if (result.scopeChanged)
            (0, socket_1.disconnectUserSockets)(id);
        return result.admin;
    },
    async disable(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const admin = await prisma_1.prisma.$transaction(async (tx) => {
            await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
            const existing = await admins_repository_1.AdminsRepository.findById(id, storeId, tx);
            if (!existing)
                throw new AppError_1.AppError(404, "Admin not found");
            if (!existing.isActive)
                return existing;
            const admin = await admins_repository_1.AdminsRepository.update(id, storeId, {
                isActive: false,
                authVersion: { increment: 1 },
            }, tx);
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: client_1.AuditAction.ADMIN_DISABLED,
                    metadata: { adminId: id },
                },
            });
            return admin;
        }, prisma_1.transactionOptions);
        (0, socket_1.disconnectUserSockets)(id);
        return admin;
    },
    async enable(id, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        return prisma_1.prisma.$transaction(async (tx) => {
            const existing = await admins_repository_1.AdminsRepository.findById(id, storeId, tx);
            if (!existing)
                throw new AppError_1.AppError(404, "Admin not found");
            if (existing.isActive)
                return existing;
            await (0, plan_limit_service_1.assertPlanCapacity)(tx, storeId, "users");
            const admin = await admins_repository_1.AdminsRepository.update(id, storeId, {
                isActive: true,
                authVersion: { increment: 1 },
            }, tx);
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: client_1.AuditAction.ADMIN_ENABLED,
                    metadata: { adminId: id },
                },
            });
            return admin;
        }, prisma_1.transactionOptions);
    },
    async delete(id, user) {
        return exports.AdminsService.disable(id, user);
    },
};
