"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeProductResponse = serializeProductResponse;
const storage_1 = require("../../../core/storage");
const product_image_presenter_1 = require("../images/presenters/product-image.presenter");
function serializeProductResponse(product, includeImages, storage = storage_1.localFileStorage) {
    const { images = [], _count, ...data } = product;
    const imageResponses = images.map((image) => (0, product_image_presenter_1.serializeProductImage)(image, storage));
    const primaryImage = imageResponses.find((image) => image.isPrimary) ?? imageResponses[0] ?? null;
    return {
        ...data,
        primaryImageUrl: primaryImage?.url ?? null,
        primaryThumbnailUrl: primaryImage?.thumbnailUrl ?? null,
        imageCount: _count?.images ?? imageResponses.length,
        ...(includeImages ? { images: imageResponses } : {}),
    };
}
