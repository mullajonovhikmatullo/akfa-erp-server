"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.R2FileStorageService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const AppError_1 = require("../errors/AppError");
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
function isNotFound(error) {
    const candidate = error;
    return candidate?.name === "NotFound" || candidate?.$metadata?.httpStatusCode === 404;
}
class R2FileStorageService {
    constructor(config) {
        this.client = new client_s3_1.S3Client({
            region: "auto",
            endpoint: config.endpoint.replace(/\/+$/, ""),
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        this.bucketName = config.bucketName;
        this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
    }
    assertStorageKey(storageKey) {
        if (!storageKey ||
            storageKey.includes("\\") ||
            storageKey.includes("\0") ||
            storageKey.startsWith("/")) {
            throw new AppError_1.AppError(400, "Invalid storage key");
        }
        const segments = storageKey.split("/");
        if (segments.some((segment) => !segment ||
            segment === "." ||
            segment === ".." ||
            !SAFE_SEGMENT.test(segment))) {
            throw new AppError_1.AppError(400, "Invalid storage key");
        }
    }
    async save(input) {
        this.assertStorageKey(input.storageKey);
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucketName,
            Key: input.storageKey,
            Body: input.content,
            ContentLength: input.content.length,
            ContentType: input.contentType ?? "application/octet-stream",
        }));
        return {
            storageKey: input.storageKey,
            sizeBytes: input.content.length,
        };
    }
    async delete(storageKey) {
        this.assertStorageKey(storageKey);
        await this.client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: storageKey,
        }));
    }
    async exists(storageKey) {
        this.assertStorageKey(storageKey);
        try {
            await this.client.send(new client_s3_1.HeadObjectCommand({
                Bucket: this.bucketName,
                Key: storageKey,
            }));
            return true;
        }
        catch (error) {
            if (isNotFound(error))
                return false;
            throw error;
        }
    }
    async read(storageKey) {
        this.assertStorageKey(storageKey);
        try {
            const response = await this.client.send(new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: storageKey,
            }));
            if (!response.Body)
                throw new AppError_1.AppError(404, "Image file not found");
            return Buffer.from(await response.Body.transformToByteArray());
        }
        catch (error) {
            if (error instanceof AppError_1.AppError || isNotFound(error)) {
                throw new AppError_1.AppError(404, "Image file not found");
            }
            throw error;
        }
    }
    getPublicUrl(storageKey) {
        this.assertStorageKey(storageKey);
        const encoded = storageKey
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return `${this.publicBaseUrl}/${encoded}`;
    }
}
exports.R2FileStorageService = R2FileStorageService;
