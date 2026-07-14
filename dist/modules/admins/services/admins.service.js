"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../../core/errors/AppError");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const admins_repository_1 = require("../repositories/admins.repository");
exports.AdminsService = {
    async create(dto) {
        const [existingUser, branch] = await Promise.all([
            admins_repository_1.AdminsRepository.findByUsername(dto.username),
            prisma_1.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } }),
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
        });
    },
    async findAll(filters) {
        return admins_repository_1.AdminsRepository.findAll(filters);
    },
    async findPaginated(params) {
        const { page, pageSize, ...filters } = params;
        const [items, total, totalAssigned, totalUnassigned] = await Promise.all([
            admins_repository_1.AdminsRepository.findPaginated(filters, page, pageSize),
            admins_repository_1.AdminsRepository.count(filters),
            admins_repository_1.AdminsRepository.countAssigned(),
            admins_repository_1.AdminsRepository.countUnassigned(),
        ]);
        return { items, total, totalAssigned, totalUnassigned };
    },
    async findById(id) {
        const admin = await admins_repository_1.AdminsRepository.findById(id);
        if (!admin) {
            throw new AppError_1.AppError(404, "Admin not found");
        }
        return admin;
    },
    async update(id, dto) {
        await exports.AdminsService.findById(id);
        if (dto.branchId) {
            const branch = await prisma_1.prisma.branch.findUnique({
                where: { id: dto.branchId },
                select: { id: true },
            });
            if (!branch) {
                throw new AppError_1.AppError(404, "Branch not found");
            }
        }
        return admins_repository_1.AdminsRepository.update(id, dto);
    },
    async disable(id) {
        await exports.AdminsService.findById(id);
        return admins_repository_1.AdminsRepository.update(id, { isActive: false });
    },
    async enable(id) {
        await exports.AdminsService.findById(id);
        return admins_repository_1.AdminsRepository.update(id, { isActive: true });
    },
    async delete(id) {
        await exports.AdminsService.findById(id);
        return admins_repository_1.AdminsRepository.delete(id);
    },
};
