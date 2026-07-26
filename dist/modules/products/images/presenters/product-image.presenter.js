"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeProductImage = serializeProductImage;
function serializeProductImage(image, storage) {
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
