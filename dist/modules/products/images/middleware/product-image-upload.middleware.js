"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productImageUpload = productImageUpload;
const multer_1 = __importDefault(require("multer"));
const uploads_1 = require("../../../../core/config/uploads");
const AppError_1 = require("../../../../core/errors/AppError");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: uploads_1.uploadConfig.productImageMaxSizeBytes,
        files: uploads_1.uploadConfig.productImageMaxCount,
    },
    fileFilter: (_req, file, callback) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            callback(new AppError_1.AppError(422, "Only JPEG, PNG and WebP images are supported"));
            return;
        }
        callback(null, true);
    },
}).array("images", uploads_1.uploadConfig.productImageMaxCount);
function productImageUpload(req, res, next) {
    upload(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        if (error instanceof AppError_1.AppError) {
            next(error);
            return;
        }
        if (error instanceof multer_1.default.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                next(new AppError_1.AppError(413, "Image must not exceed 5 MB"));
                return;
            }
            if (error.code === "LIMIT_FILE_COUNT") {
                next(new AppError_1.AppError(422, "A product can have at most 5 images"));
                return;
            }
            next(new AppError_1.AppError(422, "Invalid image upload request"));
            return;
        }
        next(error);
    });
}
