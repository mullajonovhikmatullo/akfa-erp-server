import { createHash, randomBytes } from "crypto";
import { HandoffPurpose, Prisma } from "@prisma/client";

const DEFAULT_LOGIN_TTL_MINUTES = 5;
const DEFAULT_SETUP_TTL_HOURS = 24;

type TransactionClient = Prisma.TransactionClient;

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, maximum);
}

function addMilliseconds(date: Date, milliseconds: number): Date {
    return new Date(date.getTime() + milliseconds);
}

export function hashHandoffCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}

export function getHandoffExpiry(purpose: HandoffPurpose, now = new Date()): Date {
    if (purpose === HandoffPurpose.ACCOUNT_SETUP) {
        const hours = positiveInteger(process.env.ACCOUNT_SETUP_TTL_HOURS, DEFAULT_SETUP_TTL_HOURS, 72);
        return addMilliseconds(now, hours * 60 * 60 * 1000);
    }

    const minutes = positiveInteger(process.env.LOGIN_HANDOFF_TTL_MINUTES, DEFAULT_LOGIN_TTL_MINUTES, 15);
    return addMilliseconds(now, minutes * 60 * 1000);
}

export async function createAuthHandoff(
    tx: TransactionClient,
    input: {
        userId: string;
        purpose: HandoffPurpose;
        createdById?: string;
        invalidatePrevious?: boolean;
    }
) {
    const now = new Date();
    const code = randomBytes(32).toString("base64url");
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
