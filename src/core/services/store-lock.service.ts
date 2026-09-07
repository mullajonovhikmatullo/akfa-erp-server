import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export async function lockStore(
    tx: Prisma.TransactionClient,
    storeId: string,
    mode: "exclusive" | "shared" = "exclusive"
): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Store" WHERE "id" = ${storeId}
            ${mode === "shared" ? Prisma.sql`FOR SHARE` : Prisma.sql`FOR UPDATE`}`
    );

    if (rows.length !== 1) {
        throw new AppError(404, "Store not found");
    }
}
