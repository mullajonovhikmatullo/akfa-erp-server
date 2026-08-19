"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePhotoService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const AppError_1 = require("../../../core/errors/AppError");
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_MAX_INPUT_PIXELS = 40000000;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);
function decodeImageDataUrl(value) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || !SUPPORTED_MIME_TYPES.has(match[1])) {
        throw new AppError_1.AppError(422, "Only JPEG, PNG and WebP profile photos are supported");
    }
    const content = Buffer.from(match[2], "base64");
    if (content.length === 0) {
        throw new AppError_1.AppError(422, "Profile photo is empty");
    }
    if (content.length > PROFILE_PHOTO_MAX_BYTES) {
        throw new AppError_1.AppError(413, "Profile photo must not exceed 5 MB");
    }
    return content;
}
function toWebpDataUrl(content) {
    return `data:image/webp;base64,${content.toString("base64")}`;
}
exports.ProfilePhotoService = {
    async process(value) {
        const content = decodeImageDataUrl(value);
        try {
            const metadata = await (0, sharp_1.default)(content, {
                failOn: "error",
                limitInputPixels: PROFILE_PHOTO_MAX_INPUT_PIXELS,
                sequentialRead: true,
            }).metadata();
            if (!metadata.format ||
                !SUPPORTED_FORMATS.has(metadata.format) ||
                !metadata.width ||
                !metadata.height) {
                throw new AppError_1.AppError(422, "Invalid or unsupported profile photo");
            }
            const base64Photo = await (0, sharp_1.default)(content, {
                failOn: "error",
                limitInputPixels: PROFILE_PHOTO_MAX_INPUT_PIXELS,
                sequentialRead: true,
            })
                .rotate()
                .resize({
                width: 1400,
                height: 1400,
                fit: "inside",
                withoutEnlargement: true,
            })
                .webp({ quality: 90, smartSubsample: true })
                .toBuffer();
            const thumbnailPhoto = await (0, sharp_1.default)(content, {
                failOn: "error",
                limitInputPixels: PROFILE_PHOTO_MAX_INPUT_PIXELS,
                sequentialRead: true,
            })
                .rotate()
                .resize({
                width: 96,
                height: 96,
                fit: "cover",
                position: "attention",
            })
                .webp({ quality: 82, smartSubsample: true })
                .toBuffer();
            return {
                base64Photo: toWebpDataUrl(base64Photo),
                thumbnailPhoto: toWebpDataUrl(thumbnailPhoto),
            };
        }
        catch (error) {
            if (error instanceof AppError_1.AppError)
                throw error;
            throw new AppError_1.AppError(422, "Invalid or corrupted profile photo");
        }
    },
};
