import path from "path";

function readBoundedInteger(
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum: number
): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

export type UploadConfig = {
    rootDirectory: string;
    publicBaseUrl: string;
    productImageMaxSizeBytes: number;
    productImageMaxCount: number;
};

export function loadUploadConfig(
    env: NodeJS.ProcessEnv = process.env,
    workingDirectory = process.cwd()
): UploadConfig {
    const port = env.PORT || "3000";
    const maxSizeMb = readBoundedInteger(env.PRODUCT_IMAGE_MAX_SIZE_MB, 5, 1, 5);
    const maxCount = readBoundedInteger(env.PRODUCT_IMAGE_MAX_COUNT, 5, 1, 5);

    return {
        rootDirectory: path.resolve(workingDirectory, env.UPLOAD_ROOT || "./uploads"),
        publicBaseUrl: (
            env.PUBLIC_UPLOAD_BASE_URL || `http://localhost:${port}/uploads`
        ).replace(/\/+$/, ""),
        productImageMaxSizeBytes: maxSizeMb * 1024 * 1024,
        productImageMaxCount: maxCount,
    };
}

export const uploadConfig = loadUploadConfig();
