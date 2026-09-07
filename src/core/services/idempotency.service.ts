import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../errors/AppError";

export const idempotencyKeySchema = z.string().min(1).max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Invalid Idempotency-Key").optional();

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value).filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

// Must be called inside the SAME transaction as the business mutation. The
// unique insert waits for competing requests; rollback also removes the claim.
export async function claimIdempotency(
    tx: Prisma.TransactionClient,
    scope: { storeId: string; userId: string; operation: string },
    key: string | undefined,
    payload: unknown
) {
    if (key === undefined) return null;
    idempotencyKeySchema.parse(key);
    const identity = { ...scope, key };
    const requestHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
    const created = await tx.idempotencyRecord.createMany({
        data: { ...identity, requestHash },
        skipDuplicates: true,
    });
    const record = await tx.idempotencyRecord.findUniqueOrThrow({
        where: { storeId_userId_operation_key: identity },
    });
    if (record.requestHash !== requestHash) {
        throw new AppError(409, "Idempotency-Key was already used with different input");
    }
    if (created.count === 0 && record.resourceIds.length === 0) {
        throw new AppError(409, "Request result is unavailable; retry with the same Idempotency-Key");
    }
    return { id: record.id, replay: created.count === 0, resourceIds: record.resourceIds };
}

export async function completeIdempotency(
    tx: Prisma.TransactionClient,
    claim: Awaited<ReturnType<typeof claimIdempotency>>,
    resourceIds: string[]
): Promise<void> {
    if (!claim) return;
    await tx.idempotencyRecord.update({ where: { id: claim.id }, data: { resourceIds } });
}
