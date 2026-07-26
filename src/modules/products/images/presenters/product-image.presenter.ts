import { ProductImage } from "@prisma/client";
import { FileStorageService } from "../../../../core/storage";

export type ProductImagePublicRecord = Pick<
    ProductImage,
    | "id"
    | "storeId"
    | "productId"
    | "storageKey"
    | "thumbnailStorageKey"
    | "originalFilename"
    | "mimeType"
    | "fileSize"
    | "width"
    | "height"
    | "isPrimary"
    | "sortOrder"
    | "createdAt"
    | "updatedAt"
>;

export function serializeProductImage(
    image: ProductImagePublicRecord,
    storage: FileStorageService
) {
    return {
        id: image.id,
        productId: image.productId,
        url: storage.getPublicUrl(image.storageKey),
        thumbnailUrl: storage.getPublicUrl(image.thumbnailStorageKey),
        originalFilename: image.originalFilename,
        mimeType: image.mimeType,
        fileSize: image.fileSize,
        width: image.width,
        height: image.height,
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
    };
}
