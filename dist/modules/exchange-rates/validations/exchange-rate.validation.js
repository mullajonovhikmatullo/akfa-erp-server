"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExchangeRateSchema = void 0;
const zod_1 = require("zod");
const ownerPassword = zod_1.z.string().min(1, "Store owner password is required").max(200);
exports.updateExchangeRateSchema = zod_1.z.discriminatedUnion("mode", [
    zod_1.z.object({ mode: zod_1.z.literal("CBU"), ownerPassword }).strict(),
    zod_1.z.object({
        mode: zod_1.z.literal("MANUAL"),
        rate: zod_1.z.number().positive().min(1000, "Rate looks wrong").max(1000000, "Rate looks wrong").multipleOf(0.01),
        ownerPassword,
    }).strict(),
]);
