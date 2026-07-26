import { createHash } from "crypto";
import path from "path";
import { MediaKind, UserRole } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { JwtPayload } from "../../../core/types/jwt.types";
import { prisma } from "../../../infrastructure/prisma/prisma";

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

const signatures: Record<string, (content: Buffer) => boolean> = {
    "image/jpeg": (content) =>
        content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff,
    "image/png": (content) =>
        content.length >= 8 &&
        content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp": (content) =>
        content.length >= 12 &&
        content.subarray(0, 4).toString("ascii") === "RIFF" &&
        content.subarray(8, 12).toString("ascii") === "WEBP",
    "application/pdf": (content) =>
        content.length >= 5 && content.subarray(0, 5).toString("ascii") === "%PDF-",
};

function decodeBase64(value: string): Buffer {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
        throw new AppError(422, "Receipt content is not valid base64");
    }
    const content = Buffer.from(value, "base64");
    if (!content.length || content.length > MAX_RECEIPT_BYTES) {
        throw new AppError(422, "Receipt must be smaller than 4 MB");
    }
    return content;
}

function safeFileName(value: string): string {
    const base = path.basename(value).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
    return (base || "receipt").slice(0, 160);
}

export function prepareReceipt(input: {
    fileName: string;
    mimeType: string;
    base64: string;
}) {
    const content = decodeBase64(input.base64);
    const matchesSignature = signatures[input.mimeType]?.(content) ?? false;
    if (!matchesSignature) {
        throw new AppError(422, "Receipt file content does not match its MIME type");
    }

    return {
        kind: MediaKind.PAYMENT_RECEIPT,
        fileName: safeFileName(input.fileName),
        mimeType: input.mimeType,
        sizeBytes: content.length,
        checksum: createHash("sha256").update(content).digest("hex"),
        content: Uint8Array.from(content),
    };
}

export const MediaService = {
    async download(id: string, actor: JwtPayload) {
        const media = await prisma.mediaObject.findUnique({
            where: { id },
            select: {
                id: true,
                storeId: true,
                kind: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                content: true,
            },
        });
        if (!media) throw new AppError(404, "Media not found");

        const isPlatformOwner = actor.role === UserRole.PLATFORM_OWNER;
        if (!isPlatformOwner && actor.storeId !== media.storeId) {
            throw new AppError(404, "Media not found");
        }

        return media;
    },
};
