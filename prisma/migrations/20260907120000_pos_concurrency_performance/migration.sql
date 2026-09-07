-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "resourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_storeId_userId_operation_key_key" ON "IdempotencyRecord"("storeId", "userId", "operation", "key");

-- CreateIndex
CREATE INDEX "Product_storeId_createdAt_id_idx" ON "Product"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Inventory_storeId_updatedAt_id_idx" ON "Inventory"("storeId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "StockBatch_storeId_receivedAt_id_idx" ON "StockBatch"("storeId", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "StockBatch_branchId_receivedAt_id_idx" ON "StockBatch"("branchId", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "StockBatch_branchId_productId_receivedAt_id_idx" ON "StockBatch"("branchId", "productId", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "StockMovement_storeId_createdAt_id_idx" ON "StockMovement"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_productId_createdAt_id_idx" ON "StockMovement"("branchId", "productId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_createdAt_id_idx" ON "StockMovement"("branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Customer_storeId_createdAt_id_idx" ON "Customer"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Customer_branchId_createdAt_id_idx" ON "Customer"("branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Sale_storeId_createdAt_id_idx" ON "Sale"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Sale_branchId_createdAt_id_idx" ON "Sale"("branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Expense_storeId_expenseDate_idx" ON "Expense"("storeId", "expenseDate");

-- CreateIndex
CREATE INDEX "Transfer_storeId_createdAt_id_idx" ON "Transfer"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Transfer_fromBranchId_status_createdAt_idx" ON "Transfer"("fromBranchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_toBranchId_status_createdAt_idx" ON "Transfer"("toBranchId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Match the existing one-pending-subscription-payment rule. Before deployment,
-- check for duplicates; do not discard or approve financial records automatically.
CREATE UNIQUE INDEX "Payment_one_pending_per_store"
    ON "Payment" ("storeId") WHERE "status" = 'PENDING';

-- NOT VALID avoids scanning historical tables while adding protection for new
-- writes. Audit old data, then VALIDATE CONSTRAINT in a separate maintenance step.
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_quantity_nonnegative"
    CHECK ("quantity" >= 0) NOT VALID;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_quantities_valid"
    CHECK ("initialQty" >= 0 AND "remainingQty" >= 0 AND "remainingQty" <= "initialQty") NOT VALID;
