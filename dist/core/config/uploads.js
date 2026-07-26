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
    return {
        rootDirectory: path_1.default.resolve(workingDirectory, env.UPLOAD_ROOT || "./uploads"),
        publicBaseUrl: (env.PUBLIC_UPLOAD_BASE_URL || `http://localhost:${port}/uploads`).replace(/\/+$/, ""),
        productImageMaxSizeBytes: maxSizeMb * 1024 * 1024,
        productImageMaxCount: maxCount,
    };
}
exports.uploadConfig = loadUploadConfig();
