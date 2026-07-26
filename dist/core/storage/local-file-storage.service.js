"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalFileStorageService = void 0;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const AppError_1 = require("../errors/AppError");
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
class LocalFileStorageService {
    constructor(rootDirectory, publicBaseUrl) {
        this.rootDirectory = path_1.default.resolve(rootDirectory);
        this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
    }
    resolveStoragePath(storageKey) {
        if (!storageKey ||
            storageKey.includes("\\") ||
            storageKey.includes("\0") ||
            path_1.default.posix.isAbsolute(storageKey)) {
            throw new AppError_1.AppError(400, "Invalid storage key");
        }
        const segments = storageKey.split("/");
        if (segments.some((segment) => !segment ||
            segment === "." ||
            segment === ".." ||
            !SAFE_SEGMENT.test(segment))) {
            throw new AppError_1.AppError(400, "Invalid storage key");
        }
        const resolved = path_1.default.resolve(this.rootDirectory, ...segments);
        if (resolved !== this.rootDirectory &&
            !resolved.startsWith(`${this.rootDirectory}${path_1.default.sep}`)) {
            throw new AppError_1.AppError(400, "Invalid storage key");
        }
        return resolved;
    }
    async save(input) {
        const target = this.resolveStoragePath(input.storageKey);
        const directory = path_1.default.dirname(target);
        const temporary = path_1.default.join(directory, `.${path_1.default.basename(target)}.${(0, crypto_1.randomUUID)()}.tmp`);
        await (0, promises_1.mkdir)(directory, { recursive: true, mode: 0o750 });
        try {
            await (0, promises_1.access)(target, fs_1.constants.F_OK);
            throw new AppError_1.AppError(409, "Stored file already exists");
        }
        catch (error) {
            if (error instanceof AppError_1.AppError)
                throw error;
            const code = error.code;
            if (code !== "ENOENT")
                throw error;
        }
        try {
            await (0, promises_1.writeFile)(temporary, input.content, {
                flag: "wx",
                mode: 0o640,
            });
            await (0, promises_1.rename)(temporary, target);
        }
        catch (error) {
            await (0, promises_1.rm)(temporary, { force: true }).catch(() => undefined);
            throw error;
        }
        return {
            storageKey: input.storageKey,
            sizeBytes: input.content.length,
        };
    }
    async delete(storageKey) {
        await (0, promises_1.rm)(this.resolveStoragePath(storageKey), { force: true });
    }
    async exists(storageKey) {
        try {
            await (0, promises_1.access)(this.resolveStoragePath(storageKey), fs_1.constants.R_OK);
            return true;
        }
        catch (error) {
            if (error.code === "ENOENT")
                return false;
            throw error;
        }
    }
    async read(storageKey) {
        try {
            return await (0, promises_1.readFile)(this.resolveStoragePath(storageKey));
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new AppError_1.AppError(404, "Image file not found");
            }
            throw error;
        }
    }
    getPublicUrl(storageKey) {
        this.resolveStoragePath(storageKey);
        const encoded = storageKey
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return `${this.publicBaseUrl}/${encoded}`;
    }
}
exports.LocalFileStorageService = LocalFileStorageService;
