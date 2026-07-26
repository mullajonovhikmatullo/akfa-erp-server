import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { uploadConfig } from "../../../../core/config/uploads";
import { AppError } from "../../../../core/errors/AppError";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: uploadConfig.productImageMaxSizeBytes,
        files: uploadConfig.productImageMaxCount,
    },
    fileFilter: (_req, file, callback) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            callback(new AppError(422, "Only JPEG, PNG and WebP images are supported"));
            return;
        }
        callback(null, true);
    },
}).array("images", uploadConfig.productImageMaxCount);

export function productImageUpload(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    upload(req, res, (error: unknown) => {
        if (!error) {
            next();
            return;
        }
        if (error instanceof AppError) {
            next(error);
            return;
        }
        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                next(new AppError(413, "Image must not exceed 5 MB"));
                return;
            }
            if (error.code === "LIMIT_FILE_COUNT") {
                next(new AppError(422, "A product can have at most 5 images"));
                return;
            }
            next(new AppError(422, "Invalid image upload request"));
            return;
        }
        next(error);
    });
}
