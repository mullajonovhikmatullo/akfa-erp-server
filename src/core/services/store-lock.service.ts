import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export async function lockStore(
    tx: Prisma.TransactionClient,
    storeId: string
): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`
    );

    if (rows.length !== 1) {
        throw new AppError(404, "Store not found");
    }
}
