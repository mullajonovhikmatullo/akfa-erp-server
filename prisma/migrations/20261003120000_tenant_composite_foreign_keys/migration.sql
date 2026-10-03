-- Run deploy/tenant-preflight.sql before deployment. Invalid legacy assignments
-- require an operator-approved mapping; this migration never reassigns records.
-- The original single-column FKs (and their ON DELETE behavior) are kept; each
-- additional (id, storeId) FK only rejects rows that point into another store.
BEGIN;

ALTER TABLE "CustomerBranch" ADD COLUMN "storeId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "storeId" TEXT;
ALTER TABLE "SalePayment" ADD COLUMN "storeId" TEXT;
ALTER TABLE "TransferItem" ADD COLUMN "storeId" TEXT;
ALTER TABLE "TransferAllocation" ADD COLUMN "storeId" TEXT;

UPDATE "CustomerBranch" l SET "storeId" = c."storeId" FROM "Customer" c WHERE c.id = l."customerId";
UPDATE "SaleItem" i SET "storeId" = s."storeId" FROM "Sale" s WHERE s.id = i."saleId";
UPDATE "SalePayment" p SET "storeId" = s."storeId" FROM "Sale" s WHERE s.id = p."saleId";
UPDATE "TransferItem" i SET "storeId" = t."storeId" FROM "Transfer" t WHERE t.id = i."transferId";
UPDATE "TransferAllocation" a SET "storeId" = i."storeId" FROM "TransferItem" i WHERE i.id = a."transferItemId";

ALTER TABLE "CustomerBranch" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "SalePayment" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "TransferItem" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "TransferAllocation" ALTER COLUMN "storeId" SET NOT NULL;

CREATE UNIQUE INDEX "Subscription_id_storeId_key" ON "Subscription" ("id", "storeId");
CREATE UNIQUE INDEX "MediaObject_id_storeId_key" ON "MediaObject" ("id", "storeId");
CREATE UNIQUE INDEX "User_id_storeId_key" ON "User" ("id", "storeId");
CREATE UNIQUE INDEX "ProductCategory_id_storeId_key" ON "ProductCategory" ("id", "storeId");
CREATE UNIQUE INDEX "StockBatch_id_storeId_key" ON "StockBatch" ("id", "storeId");
CREATE UNIQUE INDEX "Customer_id_storeId_key" ON "Customer" ("id", "storeId");
CREATE UNIQUE INDEX "Sale_id_storeId_key" ON "Sale" ("id", "storeId");
CREATE UNIQUE INDEX "ExpenseCategory_id_storeId_key" ON "ExpenseCategory" ("id", "storeId");
CREATE UNIQUE INDEX "Transfer_id_storeId_key" ON "Transfer" ("id", "storeId");
CREATE UNIQUE INDEX "TransferItem_id_storeId_key" ON "TransferItem" ("id", "storeId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_category_store_fkey"
    FOREIGN KEY ("categoryId", "storeId") REFERENCES "ProductCategory" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_product_store_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_product_store_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_createdBy_store_fkey"
    FOREIGN KEY ("createdById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_product_store_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdBy_store_fkey"
    FOREIGN KEY ("createdById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customer_store_fkey"
    FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customer_store_fkey"
    FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_soldBy_store_fkey"
    FOREIGN KEY ("soldById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_sale_store_fkey"
    FOREIGN KEY ("saleId", "storeId") REFERENCES "Sale" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_product_store_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_sale_store_fkey"
    FOREIGN KEY ("saleId", "storeId") REFERENCES "Sale" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_receivedBy_store_fkey"
    FOREIGN KEY ("receivedById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_category_store_fkey"
    FOREIGN KEY ("categoryId", "storeId") REFERENCES "ExpenseCategory" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_store_fkey"
    FOREIGN KEY ("createdById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromBranch_store_fkey"
    FOREIGN KEY ("fromBranchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toBranch_store_fkey"
    FOREIGN KEY ("toBranchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_initiatedBy_store_fkey"
    FOREIGN KEY ("initiatedById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_completedBy_store_fkey"
    FOREIGN KEY ("completedById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_transfer_store_fkey"
    FOREIGN KEY ("transferId", "storeId") REFERENCES "Transfer" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_product_store_fkey"
    FOREIGN KEY ("productId", "storeId") REFERENCES "Product" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "TransferAllocation" ADD CONSTRAINT "TransferAllocation_transferItem_store_fkey"
    FOREIGN KEY ("transferItemId", "storeId") REFERENCES "TransferItem" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "TransferAllocation" ADD CONSTRAINT "TransferAllocation_stockBatch_store_fkey"
    FOREIGN KEY ("stockBatchId", "storeId") REFERENCES "StockBatch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscription_store_fkey"
    FOREIGN KEY ("subscriptionId", "storeId") REFERENCES "Subscription" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receiptMedia_store_fkey"
    FOREIGN KEY ("receiptMediaId", "storeId") REFERENCES "MediaObject" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_submittedBy_store_fkey"
    FOREIGN KEY ("submittedById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_uploadedBy_store_fkey"
    FOREIGN KEY ("uploadedById", "storeId") REFERENCES "User" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_category_store_fkey";
ALTER TABLE "Inventory" VALIDATE CONSTRAINT "Inventory_branch_store_fkey";
ALTER TABLE "Inventory" VALIDATE CONSTRAINT "Inventory_product_store_fkey";
ALTER TABLE "StockBatch" VALIDATE CONSTRAINT "StockBatch_branch_store_fkey";
ALTER TABLE "StockBatch" VALIDATE CONSTRAINT "StockBatch_product_store_fkey";
ALTER TABLE "StockBatch" VALIDATE CONSTRAINT "StockBatch_createdBy_store_fkey";
ALTER TABLE "StockMovement" VALIDATE CONSTRAINT "StockMovement_branch_store_fkey";
ALTER TABLE "StockMovement" VALIDATE CONSTRAINT "StockMovement_product_store_fkey";
ALTER TABLE "StockMovement" VALIDATE CONSTRAINT "StockMovement_createdBy_store_fkey";
ALTER TABLE "Customer" VALIDATE CONSTRAINT "Customer_branch_store_fkey";
ALTER TABLE "CustomerBranch" VALIDATE CONSTRAINT "CustomerBranch_customer_store_fkey";
ALTER TABLE "CustomerBranch" VALIDATE CONSTRAINT "CustomerBranch_branch_store_fkey";
ALTER TABLE "Sale" VALIDATE CONSTRAINT "Sale_branch_store_fkey";
ALTER TABLE "Sale" VALIDATE CONSTRAINT "Sale_customer_store_fkey";
ALTER TABLE "Sale" VALIDATE CONSTRAINT "Sale_soldBy_store_fkey";
ALTER TABLE "SaleItem" VALIDATE CONSTRAINT "SaleItem_sale_store_fkey";
ALTER TABLE "SaleItem" VALIDATE CONSTRAINT "SaleItem_product_store_fkey";
ALTER TABLE "SalePayment" VALIDATE CONSTRAINT "SalePayment_sale_store_fkey";
ALTER TABLE "SalePayment" VALIDATE CONSTRAINT "SalePayment_receivedBy_store_fkey";
ALTER TABLE "Expense" VALIDATE CONSTRAINT "Expense_branch_store_fkey";
ALTER TABLE "Expense" VALIDATE CONSTRAINT "Expense_category_store_fkey";
ALTER TABLE "Expense" VALIDATE CONSTRAINT "Expense_createdBy_store_fkey";
ALTER TABLE "Transfer" VALIDATE CONSTRAINT "Transfer_fromBranch_store_fkey";
ALTER TABLE "Transfer" VALIDATE CONSTRAINT "Transfer_toBranch_store_fkey";
ALTER TABLE "Transfer" VALIDATE CONSTRAINT "Transfer_initiatedBy_store_fkey";
ALTER TABLE "Transfer" VALIDATE CONSTRAINT "Transfer_completedBy_store_fkey";
ALTER TABLE "TransferItem" VALIDATE CONSTRAINT "TransferItem_transfer_store_fkey";
ALTER TABLE "TransferItem" VALIDATE CONSTRAINT "TransferItem_product_store_fkey";
ALTER TABLE "TransferAllocation" VALIDATE CONSTRAINT "TransferAllocation_transferItem_store_fkey";
ALTER TABLE "TransferAllocation" VALIDATE CONSTRAINT "TransferAllocation_stockBatch_store_fkey";
ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_branch_store_fkey";
ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_subscription_store_fkey";
ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_receiptMedia_store_fkey";
ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_submittedBy_store_fkey";
ALTER TABLE "MediaObject" VALIDATE CONSTRAINT "MediaObject_uploadedBy_store_fkey";
COMMIT;
