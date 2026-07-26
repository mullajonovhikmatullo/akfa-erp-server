import { Prisma } from "@prisma/client";
import { prisma, transactionOptions } from "../../../../infrastructure/prisma/prisma";

export const productImageSelect = {
    id: true,
    storeId: true,
    productId: true,
    storageKey: true,
    thumbnailStorageKey: true,
    originalFilename: true,
    mimeType: true,
    fileSize: true,
    width: true,
    height: true,
    isPrimary: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type ProductImageRecord = Prisma.ProductImageGetPayload<{
    select: typeof productImageSelect;
}>;

export const ProductImagesRepository = {
    findTenantProduct(productId: string, storeId: string) {
        return prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true, storeId: true },
        });
    },

    list(productId: string, storeId: string) {
        return prisma.productImage.findMany({
            where: { productId, storeId },
            select: productImageSelect,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        });
    },

    findImage(imageId: string, productId: string, storeId: string) {
        return prisma.productImage.findFirst({
            where: { id: imageId, productId, storeId },
            select: productImageSelect,
        });
    },

    transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
        return prisma.$transaction(callback, transactionOptions);
    },

    async lockTenantProduct(
        tx: Prisma.TransactionClient,
        productId: string,
        storeId: string
    ) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Product"
            WHERE "id" = ${productId} AND "storeId" = ${storeId}
            FOR UPDATE
        `;
        return rows[0] ?? null;
    },
};
