"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockStore = lockStore;
const client_1 = require("@prisma/client");
const AppError_1 = require("../errors/AppError");
async function lockStore(tx, storeId) {
    const rows = await tx.$queryRaw(client_1.Prisma.sql `SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`);
    if (rows.length !== 1) {
        throw new AppError_1.AppError(404, "Store not found");
    }
}
