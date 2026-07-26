import { constants } from "fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "../errors/AppError";
import {
    FileStorageService,
    SaveFileInput,
    StoredFile,
} from "./file-storage.service";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export class LocalFileStorageService implements FileStorageService {
    private readonly rootDirectory: string;
    private readonly publicBaseUrl: string;

    constructor(rootDirectory: string, publicBaseUrl: string) {
        this.rootDirectory = path.resolve(rootDirectory);
        this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
    }

    private resolveStoragePath(storageKey: string): string {
        if (
            !storageKey ||
            storageKey.includes("\\") ||
            storageKey.includes("\0") ||
            path.posix.isAbsolute(storageKey)
        ) {
            throw new AppError(400, "Invalid storage key");
        }

        const segments = storageKey.split("/");
        if (
            segments.some(
                (segment) =>
                    !segment ||
                    segment === "." ||
                    segment === ".." ||
                    !SAFE_SEGMENT.test(segment)
            )
        ) {
            throw new AppError(400, "Invalid storage key");
        }

        const resolved = path.resolve(this.rootDirectory, ...segments);
        if (
            resolved !== this.rootDirectory &&
            !resolved.startsWith(`${this.rootDirectory}${path.sep}`)
        ) {
            throw new AppError(400, "Invalid storage key");
        }
        return resolved;
    }

    async save(input: SaveFileInput): Promise<StoredFile> {
        const target = this.resolveStoragePath(input.storageKey);
        const directory = path.dirname(target);
        const temporary = path.join(
            directory,
            `.${path.basename(target)}.${randomUUID()}.tmp`
        );

        await mkdir(directory, { recursive: true, mode: 0o750 });
        try {
            await access(target, constants.F_OK);
            throw new AppError(409, "Stored file already exists");
        } catch (error) {
            if (error instanceof AppError) throw error;
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT") throw error;
        }

        try {
            await writeFile(temporary, input.content, {
                flag: "wx",
                mode: 0o640,
            });
            await rename(temporary, target);
        } catch (error) {
            await rm(temporary, { force: true }).catch(() => undefined);
            throw error;
        }

        return {
            storageKey: input.storageKey,
            sizeBytes: input.content.length,
        };
    }

    async delete(storageKey: string): Promise<void> {
        await rm(this.resolveStoragePath(storageKey), { force: true });
    }

    async exists(storageKey: string): Promise<boolean> {
        try {
            await access(this.resolveStoragePath(storageKey), constants.R_OK);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    async read(storageKey: string): Promise<Buffer> {
        try {
            return await readFile(this.resolveStoragePath(storageKey));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new AppError(404, "Image file not found");
            }
            throw error;
        }
    }

    getPublicUrl(storageKey: string): string {
        this.resolveStoragePath(storageKey);
        const encoded = storageKey
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return `${this.publicBaseUrl}/${encoded}`;
    }
}
