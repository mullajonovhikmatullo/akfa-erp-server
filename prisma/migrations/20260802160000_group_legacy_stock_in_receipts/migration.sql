WITH receipt_groups AS (
  SELECT
    "storeId",
    "branchId",
    "createdById",
    "receivedAt",
    MIN("id") AS "groupId"
  FROM "StockBatch"
  WHERE "receiptId" = "id"
  GROUP BY "storeId", "branchId", "createdById", "receivedAt"
)
UPDATE "StockBatch" AS batch
SET "receiptId" = receipt_groups."groupId"
FROM receipt_groups
WHERE batch."receiptId" = batch."id"
  AND batch."storeId" = receipt_groups."storeId"
  AND batch."branchId" = receipt_groups."branchId"
  AND batch."createdById" = receipt_groups."createdById"
  AND batch."receivedAt" = receipt_groups."receivedAt";
