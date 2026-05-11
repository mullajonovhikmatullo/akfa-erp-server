import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { listAdminsSchema } from "../validations/admin.validation";
import { AdminsService } from "../services/admins.service";

export const AdminsController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const admin = await AdminsService.create(req.body);
            return ApiResponse.created(res, admin, "Admin created successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const filters = listAdminsSchema.parse(req.query);
            const admins = await AdminsService.findAll(filters);
            return ApiResponse.success(res, admins);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const admin = await AdminsService.findById(req.params.id as string);
            return ApiResponse.success(res, admin);
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const admin = await AdminsService.update(req.params.id as string, req.body);
            return ApiResponse.success(res, admin, "Admin updated successfully");
        } catch (error) {
            next(error);
        }
    },

    async disable(req: Request, res: Response, next: NextFunction) {
        try {
            const admin = await AdminsService.disable(req.params.id as string);
            return ApiResponse.success(res, admin, "Admin disabled");
        } catch (error) {
            next(error);
        }
    },

    async enable(req: Request, res: Response, next: NextFunction) {
        try {
            const admin = await AdminsService.enable(req.params.id as string);
            return ApiResponse.success(res, admin, "Admin enabled");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await AdminsService.delete(req.params.id as string);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
