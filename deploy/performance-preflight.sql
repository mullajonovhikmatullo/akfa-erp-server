-- Read-only preflight. Run against production-sized staging first.
SELECT "storeId", COUNT(*) AS pending_count
FROM "Payment" WHERE status = 'PENDING'
GROUP BY "storeId" HAVING COUNT(*) > 1;

SELECT id, "storeId", "branchId", "productId", quantity
FROM "Inventory" WHERE quantity < 0;

SELECT id, "storeId", "branchId", "productId", "initialQty", "remainingQty"
FROM "StockBatch"
WHERE "initialQty" < 0 OR "remainingQty" < 0 OR "remainingQty" > "initialQty";

WITH batches AS (
    SELECT "storeId", "branchId", "productId", SUM("remainingQty") AS quantity
    FROM "StockBatch" GROUP BY "storeId", "branchId", "productId"
)
SELECT COALESCE(inv."storeId", b."storeId") AS "storeId",
    COALESCE(inv."branchId", b."branchId") AS "branchId",
    COALESCE(inv."productId", b."productId") AS "productId",
    COALESCE(inv.quantity, 0) AS balance, COALESCE(b.quantity, 0) AS batches
FROM "Inventory" inv FULL JOIN batches b USING ("storeId", "branchId", "productId")
WHERE COALESCE(inv.quantity, 0) <> COALESCE(b.quantity, 0);

-- AFTER explicit reconciliation, validate historical rows in a maintenance step:
-- ALTER TABLE "Inventory" VALIDATE CONSTRAINT "Inventory_quantity_nonnegative";
-- ALTER TABLE "StockBatch" VALIDATE CONSTRAINT "StockBatch_quantities_valid";

-- Optional post-rollout retention/volume inspection (do not delete retry keys
-- without establishing a client retry horizon and archival policy):
-- SELECT date_trunc('day', "createdAt") AS day, COUNT(*)
-- FROM "IdempotencyRecord" WHERE "createdAt" >= NOW() - INTERVAL '30 days'
-- GROUP BY 1 ORDER BY 1;
