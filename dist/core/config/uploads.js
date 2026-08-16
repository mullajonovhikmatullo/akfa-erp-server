"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadConfig = void 0;
exports.loadUploadConfig = loadUploadConfig;
const path_1 = __importDefault(require("path"));
function readBoundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed))
        return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}
function loadUploadConfig(env = process.env, workingDirectory = process.cwd()) {
    const port = env.PORT || "3000";
    const maxSizeMb = readBoundedInteger(env.PRODUCT_IMAGE_MAX_SIZE_MB, 5, 1, 5);
    const maxCount = readBoundedInteger(env.PRODUCT_IMAGE_MAX_COUNT, 5, 1, 5);
    const storageProvider = env.STORAGE_PROVIDER || "local";
    if (storageProvider !== "local" && storageProvider !== "r2") {
        throw new Error("STORAGE_PROVIDER must be either local or r2");
    }
    const r2Endpoint = env.R2_ENDPOINT?.trim();
    const r2BucketName = env.R2_BUCKET_NAME?.trim();
    const r2AccessKeyId = env.R2_ACCESS_KEY_ID?.trim();
    const r2SecretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
    const r2PublicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (storageProvider === "r2") {
        const missing = [
            ["R2_ENDPOINT", r2Endpoint],
            ["R2_BUCKET_NAME", r2BucketName],
            ["R2_ACCESS_KEY_ID", r2AccessKeyId],
            ["R2_SECRET_ACCESS_KEY", r2SecretAccessKey],
            ["R2_PUBLIC_BASE_URL", r2PublicBaseUrl],
        ]
            .filter(([, value]) => !value)
            .map(([name]) => name);
        if (missing.length > 0) {
            throw new Error(`R2 storage requires: ${missing.join(", ")}`);
        }
    }
    return {
        storageProvider,
        rootDirectory: path_1.default.resolve(workingDirectory, env.UPLOAD_ROOT || "./uploads"),
        publicBaseUrl: (env.PUBLIC_UPLOAD_BASE_URL || `http://localhost:${port}/uploads`).replace(/\/+$/, ""),
        r2Endpoint,
        r2BucketName,
        r2AccessKeyId,
        r2SecretAccessKey,
        r2PublicBaseUrl,
        productImageMaxSizeBytes: maxSizeMb * 1024 * 1024,
        productImageMaxCount: maxCount,
    };
}
exports.uploadConfig = loadUploadConfig();
