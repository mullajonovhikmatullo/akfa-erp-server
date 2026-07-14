"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransfersController = void 0;
const transfer_validation_1 = require("../validations/transfer.validation");
const transfers_service_1 = require("../services/transfers.service");
exports.TransfersController = {
    async create(req, res, next) {
        try {
            const transfer = await transfers_service_1.TransfersService.create(req.body, req.user);
            res.status(201).json({ success: true, data: transfer });
        }
        catch (err) {
            next(err);
        }
    },
    async complete(req, res, next) {
        try {
            const transfer = await transfers_service_1.TransfersService.complete(req.params.id, req.user);
            res.json({ success: true, data: transfer });
        }
        catch (err) {
            next(err);
        }
    },
    async cancel(req, res, next) {
        try {
            const transfer = await transfers_service_1.TransfersService.cancel(req.params.id, req.user);
            res.json({ success: true, data: transfer });
        }
        catch (err) {
            next(err);
        }
    },
    async findAll(req, res, next) {
        try {
            const query = transfer_validation_1.transferQuerySchema.parse(req.query);
            const transfers = await transfers_service_1.TransfersService.findAll(query, req.user);
            res.json({ success: true, data: transfers });
        }
        catch (err) {
            next(err);
        }
    },
    async findById(req, res, next) {
        try {
            const transfer = await transfers_service_1.TransfersService.findById(req.params.id, req.user);
            res.json({ success: true, data: transfer });
        }
        catch (err) {
            next(err);
        }
    },
};
