"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesController = void 0;
const branches_service_1 = require("../services/branches.service");
class BranchesController {
    static async create(req, res, next) {
        try {
            const data = {
                name: req.body.name,
                address: req.body.address,
                phone: req.body.phone,
            };
            const branch = await branches_service_1.BranchesService.create(data, req.user);
            return res.status(201).json(branch);
        }
        catch (error) {
            return next(error);
        }
    }
    static async findAll(req, res, next) {
        try {
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await branches_service_1.BranchesService.findPaginated({ page, pageSize, user: req.user });
                return res.json(result);
            }
            const branches = await branches_service_1.BranchesService.findAll(req.user);
            return res.json(branches);
        }
        catch (error) {
            return next(error);
        }
    }
    static async update(req, res, next) {
        try {
            const data = {
                name: req.body.name,
                address: req.body.address,
                phone: req.body.phone,
            };
            const branch = await branches_service_1.BranchesService.update(req.params.id, data, req.user);
            return res.json(branch);
        }
        catch (error) {
            return next(error);
        }
    }
    static async delete(req, res, next) {
        try {
            await branches_service_1.BranchesService.delete(req.params.id, req.user);
            return res.json({ message: "Branch deleted" });
        }
        catch (error) {
            return next(error);
        }
    }
}
exports.BranchesController = BranchesController;
