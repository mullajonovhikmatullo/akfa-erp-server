import bcrypt from "bcrypt";
import { AppError } from "../../../core/errors/AppError";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { CreateAdminDto } from "../dto/create-admin.dto";
import { UpdateAdminDto } from "../dto/update-admin.dto";
import { AdminsRepository } from "../repositories/admins.repository";

export const AdminsService = {
    async create(dto: CreateAdminDto) {
        const [existingUser, branch] = await Promise.all([
            AdminsRepository.findByUsername(dto.username),
            prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } }),
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
        });
    },

    async findAll(filters: { branchId?: string; isActive?: boolean }) {
        return AdminsRepository.findAll(filters);
    },

    async findPaginated(params: { branchId?: string; isActive?: boolean; page: number; pageSize: number }) {
        const { page, pageSize, ...filters } = params;
        const [items, total, totalAssigned, totalUnassigned] = await Promise.all([
            AdminsRepository.findPaginated(filters, page, pageSize),
            AdminsRepository.count(filters),
            AdminsRepository.countAssigned(),
            AdminsRepository.countUnassigned(),
        ]);
        return { items, total, totalAssigned, totalUnassigned };
    },

    async findById(id: string) {
        const admin = await AdminsRepository.findById(id);
        if (!admin) {
            throw new AppError(404, "Admin not found");
        }
        return admin;
    },

    async update(id: string, dto: UpdateAdminDto) {
        await AdminsService.findById(id);

        if (dto.branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: dto.branchId },
                select: { id: true },
            });
            if (!branch) {
                throw new AppError(404, "Branch not found");
            }
        }

        return AdminsRepository.update(id, dto);
    },

    async disable(id: string) {
        await AdminsService.findById(id);
        return AdminsRepository.update(id, { isActive: false });
    },

    async enable(id: string) {
        await AdminsService.findById(id);
        return AdminsRepository.update(id, { isActive: true });
    },

    async delete(id: string) {
        await AdminsService.findById(id);
        return AdminsRepository.delete(id);
    },
};
