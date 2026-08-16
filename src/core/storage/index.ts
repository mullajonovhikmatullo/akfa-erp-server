import { uploadConfig } from "../config/uploads";
import { LocalFileStorageService } from "./local-file-storage.service";
import { R2FileStorageService } from "./r2-file-storage.service";

export * from "./file-storage.service";
export * from "./local-file-storage.service";
export * from "./r2-file-storage.service";

export const localFileStorage = new LocalFileStorageService(
    uploadConfig.rootDirectory,
    uploadConfig.publicBaseUrl
);

const r2Config =
    uploadConfig.r2Endpoint &&
    uploadConfig.r2BucketName &&
    uploadConfig.r2AccessKeyId &&
    uploadConfig.r2SecretAccessKey &&
    uploadConfig.r2PublicBaseUrl
        ? {
              endpoint: uploadConfig.r2Endpoint,
              bucketName: uploadConfig.r2BucketName,
              accessKeyId: uploadConfig.r2AccessKeyId,
              secretAccessKey: uploadConfig.r2SecretAccessKey,
              publicBaseUrl: uploadConfig.r2PublicBaseUrl,
          }
        : undefined;

export const r2FileStorage =
    uploadConfig.storageProvider === "r2" && r2Config
        ? new R2FileStorageService(r2Config)
        : undefined;

export const fileStorage =
    uploadConfig.storageProvider === "r2" ? r2FileStorage! : localFileStorage;
