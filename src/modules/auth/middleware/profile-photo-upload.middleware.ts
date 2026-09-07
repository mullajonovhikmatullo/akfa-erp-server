import { json, NextFunction, Request, Response } from "express";
import { positiveIntegerEnv } from "../../../core/config/runtime";
import { AppError } from "../../../core/errors/AppError";
import { createConcurrencyLimit } from "../../../core/utils/concurrency-limit";

const admission = createConcurrencyLimit(positiveIntegerEnv("PROFILE_PHOTO_CONCURRENT_UPLOADS", 2));
const parsePhoto = json({ limit: "8mb" });

// Runs after authentication, before allocating the large base64 request body.
export function profilePhotoUpload(req: Request, res: Response, next: NextFunction): void {
    const release = admission.tryAcquire();
    if (!release) {
        res.setHeader("Retry-After", "1");
        next(new AppError(503, "Image processing is busy. Please retry."));
        return;
    }
    req.releaseImageUpload = release;
    const abort = () => { if (!req.complete) release(); };
    req.once("close", abort);
    parsePhoto(req, res, (error: unknown) => {
        req.removeListener("close", abort);
        if (error) release();
        next(error);
    });
}
