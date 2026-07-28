import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

export const transactionOptions = {
    maxWait: 10000,
    timeout: 60000,
};
