import { NextFunction, Request, Response } from "express";
import { ExchangeRatesService } from "../services/exchange-rates.service";

export class ExchangeRatesController {
    static async getCurrent(req: Request, res: Response, next: NextFunction) {
        try {
            return res.json(await ExchangeRatesService.getCurrent(req.user!));
        } catch (error) {
            return next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            return res.json(await ExchangeRatesService.update(req.body, req.user!));
        } catch (error) {
            return next(error);
        }
    }
}
