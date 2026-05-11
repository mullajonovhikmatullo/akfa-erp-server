import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../../core/response/ApiResponse";
import { customerQuerySchema } from "../validations/customer.validation";
import { CustomersService } from "../services/customers.service";

export const CustomersController = {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CustomersService.create(req.body, req.user!);
            return ApiResponse.created(res, customer, "Customer created successfully");
        } catch (error) {
            next(error);
        }
    },

    async findAll(req: Request, res: Response, next: NextFunction) {
        try {
            const query = customerQuerySchema.parse(req.query);
            const customers = await CustomersService.findAll(query, req.user!);
            return ApiResponse.success(res, customers);
        } catch (error) {
            next(error);
        }
    },

    async findById(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CustomersService.findById(req.params.id as string, req.user!);
            return ApiResponse.success(res, customer);
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CustomersService.update(
                req.params.id as string,
                req.body,
                req.user!
            );
            return ApiResponse.success(res, customer, "Customer updated successfully");
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await CustomersService.delete(req.params.id as string, req.user!);
            return ApiResponse.noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
