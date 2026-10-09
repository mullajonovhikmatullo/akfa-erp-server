"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeRatesController = void 0;
const exchange_rates_service_1 = require("../services/exchange-rates.service");
class ExchangeRatesController {
    static async getCurrent(req, res, next) {
        try {
            return res.json(await exchange_rates_service_1.ExchangeRatesService.getCurrent(req.user));
        }
        catch (error) {
            return next(error);
        }
    }
    static async update(req, res, next) {
        try {
            return res.json(await exchange_rates_service_1.ExchangeRatesService.update(req.body, req.user));
        }
        catch (error) {
            return next(error);
        }
    }
}
exports.ExchangeRatesController = ExchangeRatesController;
