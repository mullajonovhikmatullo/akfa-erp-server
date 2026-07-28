"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionOptions = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is required");
}
const adapter = new adapter_pg_1.PrismaPg({ connectionString });
exports.prisma = new client_1.PrismaClient({ adapter });
exports.transactionOptions = {
    maxWait: 10000,
    timeout: 60000,
};
