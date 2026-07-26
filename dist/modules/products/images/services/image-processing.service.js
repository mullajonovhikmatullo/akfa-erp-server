"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessingService = void 0;
exports.validateUploadedImageFile = validateUploadedImageFile;
const sharp_1 = __importDefault(require("sharp"));
const AppError_1 = require("../../../../core/errors/AppError");
const uploads_1 = require("../../../../core/config/uploads");
const SUPPORTED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);
function safeOriginalFilename(value) {
    const cleaned = value
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 255);
    return cleaned || "image";
}
function validateUploadedImageFile(file) {
    if (!SUPPORTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
        throw new AppError_1.AppError(422, "Only JPEG, PNG and WebP images are supported");
    }
    if (file.size <= 0) {
        throw new AppError_1.AppError(422, "Uploaded image is empty");
    }
    if (file.size > uploads_1.uploadConfig.productImageMaxSizeBytes) {
        throw new AppError_1.AppError(413, "Image must not exceed 5 MB");
    }
}
exports.ImageProcessingService = {
    async process(file) {
        validateUploadedImageFile(file);
        try {
            const metadata = await (0, sharp_1.default)(file.buffer, {
                failOn: "error",
                limitInputPixels: 40000000,
                sequentialRead: true,
            }).metadata();
            if (!metadata.format ||
                !SUPPORTED_FORMATS.has(metadata.format) ||
                !metadata.width ||
                !metadata.height) {
                throw new AppError_1.AppError(422, "Invalid or unsupported image content");
            }
            const mainResult = await (0, sharp_1.default)(file.buffer, {
                failOn: "error",
                limitInputPixels: 40000000,
                sequentialRead: true,
            })
                .rotate()
                .resize({
                width: 1200,
                height: 1200,
                fit: "inside",
                withoutEnlargement: true,
            })
                .webp({ quality: 80 })
                .toBuffer({ resolveWithObject: true });
            const thumbnail = await (0, sharp_1.default)(file.buffer, {
                failOn: "error",
                limitInputPixels: 40000000,
                sequentialRead: true,
            })
                .rotate()
                .resize({
                width: 240,
                height: 240,
                fit: "cover",
                position: "attention",
            })
                .webp({ quality: 78 })
                .toBuffer();
            return {
                main: mainResult.data,
                thumbnail,
                originalFilename: safeOriginalFilename(file.originalname),
                mimeType: "image/webp",
                fileSize: mainResult.data.length,
                width: mainResult.info.width,
                height: mainResult.info.height,
            };
        }
        catch (error) {
            if (error instanceof AppError_1.AppError)
                throw error;
            throw new AppError_1.AppError(422, "Invalid or corrupted image");
        }
    },
};
