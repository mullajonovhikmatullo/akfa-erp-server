"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePhotoService = void 0;
const AppError_1 = require("../../../core/errors/AppError");
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_THUMBNAIL_MAX_BYTES = 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function hasExpectedSignature(content, mimeType) {
    if (mimeType === "image/jpeg") {
        return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
    }
    if (mimeType === "image/png") {
        return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return content.length >= 12
        && content.subarray(0, 4).toString("ascii") === "RIFF"
        && content.subarray(8, 12).toString("ascii") === "WEBP";
}
function validateImageDataUrl(value, maxBytes) {
    const normalized = value.trim();
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(normalized);
    if (!match || !SUPPORTED_MIME_TYPES.has(match[1])) {
        throw new AppError_1.AppError(422, "Only JPEG, PNG and WebP profile photos are supported");
    }
    const encoded = match[2];
    const content = Buffer.from(encoded, "base64");
    if (content.length < 12) {
        throw new AppError_1.AppError(422, "Profile photo is empty or invalid");
    }
    if (content.length > maxBytes) {
        throw new AppError_1.AppError(413, "Profile photo is too large");
    }
    if (content.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
        throw new AppError_1.AppError(422, "Profile photo contains invalid base64 data");
    }
    if (!hasExpectedSignature(content, match[1])) {
        throw new AppError_1.AppError(422, "Profile photo content does not match its image type");
    }
    return normalized;
}
exports.ProfilePhotoService = {
    async process(value, thumbnailValue) {
        const base64Photo = validateImageDataUrl(value, PROFILE_PHOTO_MAX_BYTES);
        const thumbnailPhoto = thumbnailValue
            ? validateImageDataUrl(thumbnailValue, PROFILE_THUMBNAIL_MAX_BYTES)
            : base64Photo;
        return { base64Photo, thumbnailPhoto };
    },
};
