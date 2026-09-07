"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profilePhotoUpload = profilePhotoUpload;
const express_1 = require("express");
const runtime_1 = require("../../../core/config/runtime");
const AppError_1 = require("../../../core/errors/AppError");
const concurrency_limit_1 = require("../../../core/utils/concurrency-limit");
const admission = (0, concurrency_limit_1.createConcurrencyLimit)((0, runtime_1.positiveIntegerEnv)("PROFILE_PHOTO_CONCURRENT_UPLOADS", 2));
const parsePhoto = (0, express_1.json)({ limit: "8mb" });
// Runs after authentication, before allocating the large base64 request body.
function profilePhotoUpload(req, res, next) {
    const release = admission.tryAcquire();
    if (!release) {
        res.setHeader("Retry-After", "1");
        next(new AppError_1.AppError(503, "Image processing is busy. Please retry."));
        return;
    }
    req.releaseImageUpload = release;
    const abort = () => { if (!req.complete)
        release(); };
    req.once("close", abort);
    parsePhoto(req, res, (error) => {
        req.removeListener("close", abort);
        if (error)
            release();
        next(error);
    });
}
