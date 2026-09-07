import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { uploadConfig } from "../../../../core/config/uploads";
import { AppError } from "../../../../core/errors/AppError";
import { positiveIntegerEnv } from "../../../../core/config/runtime";
import { createConcurrencyLimit } from "../../../../core/utils/concurrency-limit";

const admission = createConcurrencyLimit(positiveIntegerEnv("PRODUCT_IMAGE_CONCURRENT_UPLOADS", 2));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: uploadConfig.productImageMaxSizeBytes,
        files: uploadConfig.productImageMaxCount,
        fields: 5,
        fieldSize: 1024,
        parts: uploadConfig.productImageMaxCount + 5,
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
    const release = admission.tryAcquire();
    if (!release) {
        res.setHeader("Retry-After", "1");
        next(new AppError(503, "Image processing is busy. Please retry."));
        return;
    }
    req.releaseImageUpload = release;
    // After parsing, only the controller's finally releases admission, even
    // if the client disconnects while sharp or storage is still working.
    const abort = () => { if (!req.complete) release(); };
    req.once("close", abort);
    upload(req, res, (error: unknown) => {
        req.removeListener("close", abort);
        if (!error) {
            next();
            return;
        }
        release();
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
