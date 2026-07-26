import { uploadConfig } from "../config/uploads";
import { LocalFileStorageService } from "./local-file-storage.service";

export * from "./file-storage.service";
export * from "./local-file-storage.service";

export const localFileStorage = new LocalFileStorageService(
    uploadConfig.rootDirectory,
    uploadConfig.publicBaseUrl
);
