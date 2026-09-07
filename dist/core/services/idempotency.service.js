"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotencyKeySchema = void 0;
exports.claimIdempotency = claimIdempotency;
exports.completeIdempotency = completeIdempotency;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const AppError_1 = require("../errors/AppError");
exports.idempotencyKeySchema = zod_1.z.string().min(1).max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Invalid Idempotency-Key").optional();
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value).filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
// Must be called inside the SAME transaction as the business mutation. The
// unique insert waits for competing requests; rollback also removes the claim.
async function claimIdempotency(tx, scope, key, payload) {
    if (key === undefined)
        return null;
    exports.idempotencyKeySchema.parse(key);
    const identity = { ...scope, key };
    const requestHash = (0, crypto_1.createHash)("sha256").update(canonicalJson(payload)).digest("hex");
    const created = await tx.idempotencyRecord.createMany({
        data: { ...identity, requestHash },
        skipDuplicates: true,
    });
    const record = await tx.idempotencyRecord.findUniqueOrThrow({
        where: { storeId_userId_operation_key: identity },
    });
    if (record.requestHash !== requestHash) {
        throw new AppError_1.AppError(409, "Idempotency-Key was already used with different input");
    }
    if (created.count === 0 && record.resourceIds.length === 0) {
        throw new AppError_1.AppError(409, "Request result is unavailable; retry with the same Idempotency-Key");
    }
    return { id: record.id, replay: created.count === 0, resourceIds: record.resourceIds };
}
async function completeIdempotency(tx, claim, resourceIds) {
    if (!claim)
        return;
    await tx.idempotencyRecord.update({ where: { id: claim.id }, data: { resourceIds } });
}
