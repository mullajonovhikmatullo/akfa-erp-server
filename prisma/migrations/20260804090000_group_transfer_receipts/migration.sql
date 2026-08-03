-- Transfer completion creates one destination batch per product. Before
-- transfer receipts reused the transfer id, those batches received separate
-- default receipt ids. The transfer-in movement is created in the same
-- transaction and therefore has the same timestamp as its destination batch.
WITH transfer_receipt_groups AS (
  SELECT
    sb."storeId",
    sb."branchId",
    sb."createdById",
    sb."receivedAt",
    MIN(sb."id") AS "groupId"
  FROM "StockBatch" sb
  WHERE EXISTS (
    SELECT 1
    FROM "StockMovement" sm
    WHERE sm."storeId" = sb."storeId"
      AND sm."branchId" = sb."branchId"
      AND sm."productId" = sb."productId"
      AND sm."createdById" = sb."createdById"
      AND sm."type" = 'TRANSFER_IN'
      AND sm."quantity" = sb."initialQty"
      AND sm."createdAt" = sb."receivedAt"
      AND COALESCE(sm."note", '') = COALESCE(sb."supplierNote", '')
  )
  GROUP BY sb."storeId", sb."branchId", sb."createdById", sb."receivedAt"
)
UPDATE "StockBatch" AS batch
SET "receiptId" = groups."groupId"
FROM transfer_receipt_groups AS groups
WHERE batch."storeId" = groups."storeId"
  AND batch."branchId" = groups."branchId"
  AND batch."createdById" = groups."createdById"
  AND batch."receivedAt" = groups."receivedAt";
