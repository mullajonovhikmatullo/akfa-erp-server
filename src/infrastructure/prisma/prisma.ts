import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const transactionOptions = {
    maxWait: 10000,
    timeout: 60000,
};
