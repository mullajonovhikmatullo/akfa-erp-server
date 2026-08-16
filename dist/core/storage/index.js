"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileStorage = exports.r2FileStorage = exports.localFileStorage = void 0;
const uploads_1 = require("../config/uploads");
const local_file_storage_service_1 = require("./local-file-storage.service");
const r2_file_storage_service_1 = require("./r2-file-storage.service");
__exportStar(require("./file-storage.service"), exports);
__exportStar(require("./local-file-storage.service"), exports);
__exportStar(require("./r2-file-storage.service"), exports);
exports.localFileStorage = new local_file_storage_service_1.LocalFileStorageService(uploads_1.uploadConfig.rootDirectory, uploads_1.uploadConfig.publicBaseUrl);
const r2Config = uploads_1.uploadConfig.r2Endpoint &&
    uploads_1.uploadConfig.r2BucketName &&
    uploads_1.uploadConfig.r2AccessKeyId &&
    uploads_1.uploadConfig.r2SecretAccessKey &&
    uploads_1.uploadConfig.r2PublicBaseUrl
    ? {
        endpoint: uploads_1.uploadConfig.r2Endpoint,
        bucketName: uploads_1.uploadConfig.r2BucketName,
        accessKeyId: uploads_1.uploadConfig.r2AccessKeyId,
        secretAccessKey: uploads_1.uploadConfig.r2SecretAccessKey,
        publicBaseUrl: uploads_1.uploadConfig.r2PublicBaseUrl,
    }
    : undefined;
exports.r2FileStorage = uploads_1.uploadConfig.storageProvider === "r2" && r2Config
    ? new r2_file_storage_service_1.R2FileStorageService(r2Config)
    : undefined;
exports.fileStorage = uploads_1.uploadConfig.storageProvider === "r2" ? exports.r2FileStorage : exports.localFileStorage;
