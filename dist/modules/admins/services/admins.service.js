"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../../core/errors/AppError");
const branch_access_1 = require("../../../core/utils/branch-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const admins_repository_1 = require("../repositories/admins.repository");
exports.AdminsService = {
    async create(dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        const [existingUser, branch] = await Promise.all([
            admins_repository_1.AdminsRepository.findByUsername(dto.username),
            prisma_1.prisma.branch.findFirst({ where: { id: dto.branchId, storeId }, select: { id: true } }),
        ]);
        if (existingUser) {
            throw new AppError_1.AppError(409, "Username is already taken");
        }
        if (!branch) {
            throw new AppError_1.AppError(404, "Branch not found");
        }
        const hashedPassword = await bcrypt_1.default.hash(dto.password, 12);
        return admins_repository_1.AdminsRepository.create({
            ...dto,
            password: hashedPassword,
            storeId,
        });
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
        if (!admin) {
            throw new AppError_1.AppError(404, "Admin not found");
        }
        return admin;
    },
    async update(id, dto, user) {
        const storeId = (0, branch_access_1.requireStoreId)(user);
        await exports.AdminsService.findById(id, user);
        if (dto.branchId) {
            const branch = await prisma_1.prisma.branch.findFirst({
                where: { id: dto.branchId, storeId },
                select: { id: true },
            });
            if (!branch) {
                throw new AppError_1.AppError(404, "Branch not found");
            }
        }
        return admins_repository_1.AdminsRepository.update(id, dto);
    },
    async disable(id, user) {
        await exports.AdminsService.findById(id, user);
        return admins_repository_1.AdminsRepository.update(id, { isActive: false });
    },
    async enable(id, user) {
        await exports.AdminsService.findById(id, user);
        return admins_repository_1.AdminsRepository.update(id, { isActive: true });
    },
    async delete(id, user) {
        await exports.AdminsService.findById(id, user);
        return admins_repository_1.AdminsRepository.delete(id);
    },
};
