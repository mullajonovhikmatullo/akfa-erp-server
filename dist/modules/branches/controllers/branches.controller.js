"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesController = void 0;
const pagination_1 = require("../../../core/utils/pagination");
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
                const { page, pageSize } = pagination_1.paginationSchema.parse(req.query);
                const result = await branches_service_1.BranchesService.findPaginated({ page, pageSize, user: req.user });
                return res.json(result);
            }
            const branches = await branches_service_1.BranchesService.findAll(req.user, pagination_1.listWindowSchema.parse(req.query));
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
