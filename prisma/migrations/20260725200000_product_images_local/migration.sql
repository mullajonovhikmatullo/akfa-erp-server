CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailStorageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductImage_dimensions_check" CHECK ("width" > 0 AND "height" > 0),
    CONSTRAINT "ProductImage_file_size_check" CHECK ("fileSize" > 0),
    CONSTRAINT "ProductImage_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "Product_id_storeId_key" ON "Product"("id", "storeId");
CREATE UNIQUE INDEX "ProductImage_storageKey_key" ON "ProductImage"("storageKey");
CREATE UNIQUE INDEX "ProductImage_thumbnailStorageKey_key" ON "ProductImage"("thumbnailStorageKey");
CREATE UNIQUE INDEX "ProductImage_one_primary_per_product"
    ON "ProductImage"("productId")
    WHERE "isPrimary" = true;
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");
CREATE INDEX "ProductImage_storeId_idx" ON "ProductImage"("storeId");
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

ALTER TABLE "ProductImage"
    ADD CONSTRAINT "ProductImage_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductImage"
    ADD CONSTRAINT "ProductImage_productId_storeId_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId")
    ON DELETE CASCADE ON UPDATE CASCADE;
