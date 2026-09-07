import { FileStorageService, fileStorage } from "../../../core/storage";
import { serializeProductImage } from "../images/presenters/product-image.presenter";

type ProductWithImageMetadata = {
    images?: Array<Parameters<typeof serializeProductImage>[0]>;
    _count?: { images?: number };
    [key: string]: unknown;
};

export function serializeProductResponse(
    product: ProductWithImageMetadata,
    includeImages: boolean,
    storage: FileStorageService = fileStorage
) {
    const { images = [], _count, ...data } = product;
    const imageResponses = images.map((image) =>
        serializeProductImage(image, storage)
    );
    const primaryImage =
        imageResponses.find((image) => image.isPrimary) ?? imageResponses[0] ?? null;

    return {
        ...data,
        primaryImageUrl: primaryImage?.url ?? null,
        primaryThumbnailUrl: primaryImage?.thumbnailUrl ?? null,
        imageCount: _count?.images ?? imageResponses.length,
        ...(includeImages ? { images: imageResponses } : {}),
    };
}
