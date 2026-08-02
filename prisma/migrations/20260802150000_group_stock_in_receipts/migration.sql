ALTER TABLE "StockBatch" ADD COLUMN "receiptId" TEXT;

UPDATE "StockBatch" SET "receiptId" = "id" WHERE "receiptId" IS NULL;

ALTER TABLE "StockBatch" ALTER COLUMN "receiptId" SET NOT NULL;

CREATE INDEX "StockBatch_storeId_receiptId_idx" ON "StockBatch"("storeId", "receiptId");
