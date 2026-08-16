import { randomUUID } from "crypto";
import { uploadConfig } from "../../../../core/config/uploads";
import { AppError } from "../../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../../core/services/billing-state.service";
import {
    FileStorageService,
    fileStorage,
} from "../../../../core/storage";
import { JwtPayload } from "../../../../core/types/jwt.types";
import { requireStoreId } from "../../../../core/utils/branch-access";
import {
    ProductImageRecord,
    ProductImagesRepository,
    productImageSelect,
} from "../repositories/product-images.repository";
import {
    serializeProductImage,
} from "../presenters/product-image.presenter";
import {
    ImageProcessingService,
    UploadedImageFile,
} from "./image-processing.service";
import { ReorderProductImagesInput } from "../validations/product-image.validation";

type ImageProcessor = typeof ImageProcessingService;

type ProductImageServiceDependencies = {
    storage: FileStorageService;
    processor: ImageProcessor;
    repository: typeof ProductImagesRepository;
    maxCount: number;
};

type StoredImageCandidate = {
    id: string;
    storageKey: string;
    thumbnailStorageKey: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
};

export function assertProductImageCapacity(
    existingCount: number,
    incomingCount: number,
    maximum = uploadConfig.productImageMaxCount
): void {
    if (incomingCount < 1) {
        throw new AppError(422, "At least one image is required");
    }
    if (existingCount + incomingCount > maximum) {
        throw new AppError(422, `A product can have at most ${maximum} images`);
    }
}

function storageKeys(storeId: string, productId: string, imageId: string) {
    const prefix = `organizations/${storeId}/products/${productId}/${imageId}`;
    return {
        storageKey: `${prefix}/main.webp`,
        thumbnailStorageKey: `${prefix}/thumbnail.webp`,
    };
}

async function deleteStoredFiles(
    storage: FileStorageService,
    keys: string[]
): Promise<void> {
    const uniqueKeys = [...new Set(keys)];
    await Promise.all(uniqueKeys.map((key) => storage.delete(key)));
}

export function createProductImagesService(
    dependencies: Partial<ProductImageServiceDependencies> = {}
) {
    const storage = dependencies.storage ?? fileStorage;
    const processor = dependencies.processor ?? ImageProcessingService;
    const repository = dependencies.repository ?? ProductImagesRepository;
    const maxCount = dependencies.maxCount ?? uploadConfig.productImageMaxCount;

    const toResponse = (image: ProductImageRecord) =>
        serializeProductImage(image, storage);

    async function assertTenantProduct(productId: string, storeId: string) {
        const product = await repository.findTenantProduct(productId, storeId);
        if (!product) throw new AppError(404, "Product not found");
        return product;
    }

    async function processAndStore(
        productId: string,
        storeId: string,
        files: UploadedImageFile[]
    ): Promise<StoredImageCandidate[]> {
        const processed = await Promise.all(
            files.map(async (file) => {
                const imageId = randomUUID();
                const keys = storageKeys(storeId, productId, imageId);
                const result = await processor.process(file);
                return {
                    id: imageId,
                    ...keys,
                    ...result,
                };
            })
        );

        const savedKeys: string[] = [];
        try {
            for (const image of processed) {
                await storage.save({
                    storageKey: image.storageKey,
                    content: image.main,
                    contentType: image.mimeType,
                });
                savedKeys.push(image.storageKey);
                await storage.save({
                    storageKey: image.thumbnailStorageKey,
                    content: image.thumbnail,
                    contentType: image.mimeType,
                });
                savedKeys.push(image.thumbnailStorageKey);
            }
        } catch (error) {
            await deleteStoredFiles(storage, savedKeys).catch(() => undefined);
            throw error;
        }

        return processed.map(
            ({ main: _main, thumbnail: _thumbnail, ...candidate }) => candidate
        );
    }

    return {
        async upload(
            productId: string,
            files: UploadedImageFile[],
            user: JwtPayload
        ) {
            const storeId = requireStoreId(user);
            await assertTenantProduct(productId, storeId);
            const existing = await repository.list(productId, storeId);
            assertProductImageCapacity(existing.length, files.length, maxCount);

            const processed = await processAndStore(
                productId,
                storeId,
                files
            );
            const savedKeys = processed.flatMap((image) => [
                image.storageKey,
                image.thumbnailStorageKey,
            ]);
            try {
                const created = await repository.transaction(async (tx) => {
                    await assertStoreWritableInTransaction(tx, storeId);
                    const product = await repository.lockTenantProduct(
                        tx,
                        productId,
                        storeId
                    );
                    if (!product) throw new AppError(404, "Product not found");

                    const current = await tx.productImage.findMany({
                        where: { productId, storeId },
                        select: {
                            id: true,
                            isPrimary: true,
                            sortOrder: true,
                        },
                        orderBy: [
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                    });
                    assertProductImageCapacity(current.length, processed.length, maxCount);

                    const hasPrimary = current.some((image) => image.isPrimary);
                    const nextSortOrder =
                        current.reduce(
                            (maximum, image) => Math.max(maximum, image.sortOrder),
                            -1
                        ) + 1;
                    const rows: ProductImageRecord[] = [];

                    for (const [index, image] of processed.entries()) {
                        const row = await tx.productImage.create({
                            data: {
                                id: image.id,
                                storeId,
                                productId,
                                storageKey: image.storageKey,
                                thumbnailStorageKey: image.thumbnailStorageKey,
                                originalFilename: image.originalFilename,
                                mimeType: image.mimeType,
                                fileSize: image.fileSize,
                                width: image.width,
                                height: image.height,
                                isPrimary: !hasPrimary && index === 0,
                                sortOrder: nextSortOrder + index,
                            },
                            select: productImageSelect,
                        });
                        rows.push(row);
                    }
                    return rows;
                });

                return created.map(toResponse);
            } catch (error) {
                await deleteStoredFiles(storage, savedKeys).catch(() => undefined);
                throw error;
            }
        },

        async replace(
            productId: string,
            imageId: string,
            files: UploadedImageFile[],
            user: JwtPayload
        ) {
            if (files.length !== 1) {
                throw new AppError(422, "Exactly one replacement image is required");
            }
            const storeId = requireStoreId(user);
            await assertTenantProduct(productId, storeId);
            const replacement = (
                await processAndStore(productId, storeId, files)
            )[0];
            if (!replacement) {
                throw new AppError(422, "Replacement image is required");
            }
            const replacementKeys = [
                replacement.storageKey,
                replacement.thumbnailStorageKey,
            ];

            try {
                const result = await repository.transaction(async (tx) => {
                    await assertStoreWritableInTransaction(tx, storeId);
                    const product = await repository.lockTenantProduct(
                        tx,
                        productId,
                        storeId
                    );
                    if (!product) throw new AppError(404, "Product not found");

                    const current = await tx.productImage.findFirst({
                        where: { id: imageId, productId, storeId },
                        select: productImageSelect,
                    });
                    if (!current) {
                        throw new AppError(404, "Product image not found");
                    }

                    await tx.productImage.deleteMany({
                        where: { id: imageId, productId, storeId },
                    });
                    await tx.productImage.create({
                        data: {
                            ...replacement,
                            storeId,
                            productId,
                            isPrimary: current.isPrimary,
                            sortOrder: current.sortOrder,
                        },
                    });

                    const images = await tx.productImage.findMany({
                        where: { productId, storeId },
                        select: productImageSelect,
                        orderBy: [
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                    });
                    return { current, images };
                });

                await deleteStoredFiles(storage, [
                    result.current.storageKey,
                    result.current.thumbnailStorageKey,
                ]).catch(() => {
                    console.error(
                        "[ProductImageCleanup] Failed to delete replaced image files"
                    );
                });

                return result.images.map(toResponse);
            } catch (error) {
                await deleteStoredFiles(storage, replacementKeys).catch(
                    () => undefined
                );
                throw error;
            }
        },

        async list(productId: string, user: JwtPayload) {
            const storeId = requireStoreId(user);
            await assertTenantProduct(productId, storeId);
            const images = await repository.list(productId, storeId);
            return images.map(toResponse);
        },

        async setPrimary(productId: string, imageId: string, user: JwtPayload) {
            const storeId = requireStoreId(user);
            const images = await repository.transaction(async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId);
                const product = await repository.lockTenantProduct(
                    tx,
                    productId,
                    storeId
                );
                if (!product) throw new AppError(404, "Product not found");

                const image = await tx.productImage.findFirst({
                    where: { id: imageId, productId, storeId },
                    select: { id: true },
                });
                if (!image) throw new AppError(404, "Product image not found");

                await tx.productImage.updateMany({
                    where: { productId, storeId, isPrimary: true },
                    data: { isPrimary: false },
                });
                await tx.productImage.updateMany({
                    where: { id: imageId, productId, storeId },
                    data: { isPrimary: true },
                });

                return tx.productImage.findMany({
                    where: { productId, storeId },
                    select: productImageSelect,
                    orderBy: [
                        { sortOrder: "asc" },
                        { createdAt: "asc" },
                        { id: "asc" },
                    ],
                });
            });
            return images.map(toResponse);
        },

        async reorder(
            productId: string,
            input: ReorderProductImagesInput,
            user: JwtPayload
        ) {
            const storeId = requireStoreId(user);
            const images = await repository.transaction(async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId);
                const product = await repository.lockTenantProduct(
                    tx,
                    productId,
                    storeId
                );
                if (!product) throw new AppError(404, "Product not found");

                const current = await tx.productImage.findMany({
                    where: { productId, storeId },
                    select: { id: true },
                });
                const currentIds = new Set(current.map((image) => image.id));
                if (
                    current.length !== input.imageIds.length ||
                    input.imageIds.some((id) => !currentIds.has(id))
                ) {
                    throw new AppError(
                        422,
                        "Reorder payload must contain every product image exactly once"
                    );
                }

                await Promise.all(
                    input.imageIds.map((id, sortOrder) =>
                        tx.productImage.updateMany({
                            where: { id, productId, storeId },
                            data: { sortOrder },
                        })
                    )
                );
                return tx.productImage.findMany({
                    where: { productId, storeId },
                    select: productImageSelect,
                    orderBy: [
                        { sortOrder: "asc" },
                        { createdAt: "asc" },
                        { id: "asc" },
                    ],
                });
            });
            return images.map(toResponse);
        },

        async delete(productId: string, imageId: string, user: JwtPayload) {
            const storeId = requireStoreId(user);
            const result = await repository.transaction(async (tx) => {
                await assertStoreWritableInTransaction(tx, storeId);
                const product = await repository.lockTenantProduct(
                    tx,
                    productId,
                    storeId
                );
                if (!product) throw new AppError(404, "Product not found");

                const image = await tx.productImage.findFirst({
                    where: { id: imageId, productId, storeId },
                    select: productImageSelect,
                });
                if (!image) throw new AppError(404, "Product image not found");

                await tx.productImage.deleteMany({
                    where: { id: imageId, productId, storeId },
                });
                const remaining = await tx.productImage.findMany({
                    where: { productId, storeId },
                    select: productImageSelect,
                    orderBy: [
                        { sortOrder: "asc" },
                        { createdAt: "asc" },
                        { id: "asc" },
                    ],
                });

                if (image.isPrimary && remaining[0]) {
                    await tx.productImage.updateMany({
                        where: {
                            id: remaining[0].id,
                            productId,
                            storeId,
                        },
                        data: { isPrimary: true },
                    });
                    remaining[0] = { ...remaining[0], isPrimary: true };
                }
                return { image, remaining };
            });

            await deleteStoredFiles(storage, [
                result.image.storageKey,
                result.image.thumbnailStorageKey,
            ]).catch(() => {
                console.error("[ProductImageCleanup] Failed to delete image files");
            });

            return result.remaining.map(toResponse);
        },

        async readFile(
            routeStoreId: string,
            productId: string,
            imageId: string,
            fileName: string,
            user: JwtPayload
        ) {
            const storeId = requireStoreId(user);
            if (routeStoreId !== storeId) {
                throw new AppError(404, "Product image not found");
            }
            if (fileName !== "main.webp" && fileName !== "thumbnail.webp") {
                throw new AppError(404, "Product image not found");
            }

            const image = await repository.findImage(imageId, productId, storeId);
            if (!image) throw new AppError(404, "Product image not found");
            const key =
                fileName === "main.webp"
                    ? image.storageKey
                    : image.thumbnailStorageKey;

            return {
                content: await storage.read(key),
                mimeType: "image/webp",
            };
        },

        async readPublicFile(
            routeStoreId: string,
            productId: string,
            imageId: string,
            fileName: string
        ) {
            if (fileName !== "main.webp" && fileName !== "thumbnail.webp") {
                throw new AppError(404, "Product image not found");
            }

            const image = await repository.findImage(imageId, productId, routeStoreId);
            if (!image) throw new AppError(404, "Product image not found");
            const key =
                fileName === "main.webp"
                    ? image.storageKey
                    : image.thumbnailStorageKey;

            return {
                content: await storage.read(key),
                mimeType: "image/webp",
            };
        },

        async cleanupProductFiles(images: Array<{
            storageKey: string;
            thumbnailStorageKey: string;
        }>) {
            await deleteStoredFiles(
                storage,
                images.flatMap((image) => [
                    image.storageKey,
                    image.thumbnailStorageKey,
                ])
            ).catch(() => {
                console.error("[ProductImageCleanup] Failed to delete product image files");
            });
        },
    };
}

export const ProductImagesService = createProductImagesService();
