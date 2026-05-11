import {Request, Response} from "express";

import {BranchesService} from "../services/branches.service";

export class BranchesController {
    static async create(req: Request, res: Response) {
        try {
            const branch = await BranchesService.create(
                req.body
            );

            return res.status(201).json(branch);
        } catch (error) {
            return res.status(500).json({
                message: "Failed to create branch",
            });
        }
    }

    static async findAll(
        req: Request,
        res: Response
    ) {
        const branches =
            await BranchesService.findAll();

        return res.json(branches);
    }

    static async update(req: Request, res: Response) {
        try {
            const branch = await BranchesService.update(req.params.id as string, req.body);
            return res.json(branch);
        } catch (error) {
            return res.status(500).json({ message: "Failed to update branch" });
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            await BranchesService.delete(req.params.id as string);

            return res.json({
                message: "Branch deleted",
            });
        } catch (error) {
            return res.status(500).json({
                message: "Delete failed",
            });
        }
    }
}