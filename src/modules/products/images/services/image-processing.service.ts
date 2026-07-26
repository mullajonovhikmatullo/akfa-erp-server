import sharp from "sharp";
import { AppError } from "../../../../core/errors/AppError";
import { uploadConfig } from "../../../../core/config/uploads";

const SUPPORTED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type UploadedImageFile = {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
};

export type ProcessedProductImage = {
    main: Buffer;
    thumbnail: Buffer;
    originalFilename: string;
    mimeType: "image/webp";
    fileSize: number;
    width: number;
    height: number;
};

function safeOriginalFilename(value: string): string {
    const cleaned = value
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 255);
    return cleaned || "image";
}

export function validateUploadedImageFile(
    file: Pick<UploadedImageFile, "mimetype" | "size">
): void {
    if (!SUPPORTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
        throw new AppError(422, "Only JPEG, PNG and WebP images are supported");
    }
    if (file.size <= 0) {
        throw new AppError(422, "Uploaded image is empty");
    }
    if (file.size > uploadConfig.productImageMaxSizeBytes) {
        throw new AppError(413, "Image must not exceed 5 MB");
    }
}

export const ImageProcessingService = {
    async process(file: UploadedImageFile): Promise<ProcessedProductImage> {
        validateUploadedImageFile(file);

        try {
            const metadata = await sharp(file.buffer, {
                failOn: "error",
                limitInputPixels: 40_000_000,
                sequentialRead: true,
            }).metadata();

            if (
                !metadata.format ||
                !SUPPORTED_FORMATS.has(metadata.format) ||
                !metadata.width ||
                !metadata.height
            ) {
                throw new AppError(422, "Invalid or unsupported image content");
            }

            const mainResult = await sharp(file.buffer, {
                failOn: "error",
                limitInputPixels: 40_000_000,
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

            const thumbnail = await sharp(file.buffer, {
                failOn: "error",
                limitInputPixels: 40_000_000,
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
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(422, "Invalid or corrupted image");
        }
    },
};
