"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionOptions = exports.prisma = void 0;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
exports.transactionOptions = {
    maxWait: 10000,
    timeout: 60000,
};
