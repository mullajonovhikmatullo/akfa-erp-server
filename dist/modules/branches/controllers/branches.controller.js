"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesController = void 0;
const branches_service_1 = require("../services/branches.service");
class BranchesController {
    static async create(req, res) {
        try {
            const branch = await branches_service_1.BranchesService.create(req.body);
            return res.status(201).json(branch);
        }
        catch (error) {
            return res.status(500).json({ message: "Failed to create branch" });
        }
    }
    static async findAll(req, res) {
        try {
            if (req.query.page !== undefined) {
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
                const result = await branches_service_1.BranchesService.findPaginated({ page, pageSize });
                return res.json(result);
            }
            const branches = await branches_service_1.BranchesService.findAll();
            return res.json(branches);
        }
        catch (error) {
            return res.status(500).json({ message: "Failed to fetch branches" });
        }
    }
    static async update(req, res) {
        try {
            const branch = await branches_service_1.BranchesService.update(req.params.id, req.body);
            return res.json(branch);
        }
        catch (error) {
            return res.status(500).json({ message: "Failed to update branch" });
        }
    }
    static async delete(req, res) {
        try {
            await branches_service_1.BranchesService.delete(req.params.id);
            return res.json({ message: "Branch deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Delete failed" });
        }
    }
}
exports.BranchesController = BranchesController;
