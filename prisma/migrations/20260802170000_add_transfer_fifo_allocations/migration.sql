CREATE TABLE "TransferAllocation" (
  "id" TEXT NOT NULL,
  "transferItemId" TEXT NOT NULL,
  "stockBatchId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransferAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferAllocation_transferItemId_stockBatchId_key"
  ON "TransferAllocation"("transferItemId", "stockBatchId");
CREATE INDEX "TransferAllocation_transferItemId_idx" ON "TransferAllocation"("transferItemId");
CREATE INDEX "TransferAllocation_stockBatchId_idx" ON "TransferAllocation"("stockBatchId");

ALTER TABLE "TransferAllocation"
  ADD CONSTRAINT "TransferAllocation_transferItemId_fkey"
  FOREIGN KEY ("transferItemId") REFERENCES "TransferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferAllocation"
  ADD CONSTRAINT "TransferAllocation_stockBatchId_fkey"
  FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
