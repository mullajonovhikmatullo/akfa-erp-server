"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashHandoffCode = hashHandoffCode;
exports.getHandoffExpiry = getHandoffExpiry;
exports.createAuthHandoff = createAuthHandoff;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const DEFAULT_LOGIN_TTL_MINUTES = 5;
const DEFAULT_SETUP_TTL_HOURS = 24;
function positiveInteger(value, fallback, maximum) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return fallback;
    return Math.min(parsed, maximum);
}
function addMilliseconds(date, milliseconds) {
    return new Date(date.getTime() + milliseconds);
}
function hashHandoffCode(code) {
    return (0, crypto_1.createHash)("sha256").update(code).digest("hex");
}
function getHandoffExpiry(purpose, now = new Date()) {
    if (purpose === client_1.HandoffPurpose.ACCOUNT_SETUP) {
        const hours = positiveInteger(process.env.ACCOUNT_SETUP_TTL_HOURS, DEFAULT_SETUP_TTL_HOURS, 72);
        return addMilliseconds(now, hours * 60 * 60 * 1000);
    }
    const minutes = positiveInteger(process.env.LOGIN_HANDOFF_TTL_MINUTES, DEFAULT_LOGIN_TTL_MINUTES, 15);
    return addMilliseconds(now, minutes * 60 * 1000);
}
async function createAuthHandoff(tx, input) {
    const now = new Date();
    const code = (0, crypto_1.randomBytes)(32).toString("base64url");
    const expiresAt = getHandoffExpiry(input.purpose, now);
    if (input.invalidatePrevious !== false) {
        await tx.authHandoff.updateMany({
            where: {
                userId: input.userId,
                purpose: input.purpose,
                usedAt: null,
            },
            data: { usedAt: now },
        });
    }
    await tx.authHandoff.create({
        data: {
            tokenHash: hashHandoffCode(code),
            purpose: input.purpose,
            userId: input.userId,
            createdById: input.createdById,
            expiresAt,
        },
    });
    return { code, expiresAt };
}
