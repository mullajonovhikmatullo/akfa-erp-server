CREATE TYPE "MediaKind" AS ENUM ('PAYMENT_RECEIPT', 'PRODUCT_IMAGE');

ALTER TABLE "Payment"
ADD COLUMN "branchId" TEXT,
ADD COLUMN "submittedById" TEXT,
ADD COLUMN "receiptMediaId" TEXT,
ADD COLUMN "rejectionReason" TEXT;

CREATE TABLE "MediaObject" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "kind" "MediaKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_receiptMediaId_key" ON "Payment"("receiptMediaId");
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");
CREATE INDEX "Payment_submittedById_idx" ON "Payment"("submittedById");
CREATE INDEX "MediaObject_storeId_kind_idx" ON "MediaObject"("storeId", "kind");
CREATE INDEX "MediaObject_uploadedById_idx" ON "MediaObject"("uploadedById");
CREATE INDEX "MediaObject_checksum_idx" ON "MediaObject"("checksum");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MediaObject"
ADD CONSTRAINT "MediaObject_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaObject"
ADD CONSTRAINT "MediaObject_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_receiptMediaId_fkey"
FOREIGN KEY ("receiptMediaId") REFERENCES "MediaObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
