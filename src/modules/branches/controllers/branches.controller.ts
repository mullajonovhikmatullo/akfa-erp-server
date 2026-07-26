import { NextFunction, Request, Response } from "express";

import { BranchesService } from "../services/branches.service";
import { CreateBranchDto } from "../dto/create-branch.dto";
import { UpdateBranchDto } from "../dto/update-branch.dto";

export class BranchesController {
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const data: CreateBranchDto = {
                name: req.body.name,
                address: req.body.address,
                phone: req.body.phone,
            };
            const branch = await BranchesService.create(data, req.user!);
            return res.status(201).json(branch);
        } catch (error) {
            return next(error);
        }
    }

    static async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await BranchesService.findPaginated({ page, pageSize, user: req.user! });
                return res.json(result);
            }
            const branches = await BranchesService.findAll(req.user!);
            return res.json(branches);
        } catch (error) {
            return next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const data: UpdateBranchDto = {
                name: req.body.name,
                address: req.body.address,
                phone: req.body.phone,
            };
            const branch = await BranchesService.update(req.params.id as string, data, req.user!);
            return res.json(branch);
        } catch (error) {
            return next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await BranchesService.delete(req.params.id as string, req.user!);
            return res.json({ message: "Branch deleted" });
        } catch (error) {
            return next(error);
        }
    }
}
