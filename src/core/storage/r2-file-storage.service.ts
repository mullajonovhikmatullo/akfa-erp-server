import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { AppError } from "../errors/AppError";
import {
    FileStorageService,
    SaveFileInput,
    StoredFile,
} from "./file-storage.service";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isNotFound(error: unknown): boolean {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return candidate?.name === "NotFound" || candidate?.$metadata?.httpStatusCode === 404;
}

export type R2FileStorageConfig = {
    endpoint: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
};

export class R2FileStorageService implements FileStorageService {
    private readonly client: S3Client;
    private readonly bucketName: string;
    private readonly publicBaseUrl: string;

    constructor(config: R2FileStorageConfig) {
        this.client = new S3Client({
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

    private assertStorageKey(storageKey: string): void {
        if (
            !storageKey ||
            storageKey.includes("\\") ||
            storageKey.includes("\0") ||
            storageKey.startsWith("/")
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
    }

    async save(input: SaveFileInput): Promise<StoredFile> {
        this.assertStorageKey(input.storageKey);
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: input.storageKey,
                Body: input.content,
                ContentLength: input.content.length,
                ContentType: input.contentType ?? "application/octet-stream",
            })
        );

        return {
            storageKey: input.storageKey,
            sizeBytes: input.content.length,
        };
    }

    async delete(storageKey: string): Promise<void> {
        this.assertStorageKey(storageKey);
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: storageKey,
            })
        );
    }

    async exists(storageKey: string): Promise<boolean> {
        this.assertStorageKey(storageKey);
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.bucketName,
                    Key: storageKey,
                })
            );
            return true;
        } catch (error) {
            if (isNotFound(error)) return false;
            throw error;
        }
    }

    async read(storageKey: string): Promise<Buffer> {
        this.assertStorageKey(storageKey);
        try {
            const response = await this.client.send(
                new GetObjectCommand({
                    Bucket: this.bucketName,
                    Key: storageKey,
                })
            );
            if (!response.Body) throw new AppError(404, "Image file not found");
            return Buffer.from(await response.Body.transformToByteArray());
        } catch (error) {
            if (error instanceof AppError || isNotFound(error)) {
                throw new AppError(404, "Image file not found");
            }
            throw error;
        }
    }

    getPublicUrl(storageKey: string): string {
        this.assertStorageKey(storageKey);
        const encoded = storageKey
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return `${this.publicBaseUrl}/${encoded}`;
    }
}
