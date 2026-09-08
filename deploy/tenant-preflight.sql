-- Read-only. Rows in the first query must be reconciled before the membership migration.
SELECT u.id, u.role, u."storeId", u."branchId", b."storeId" AS "branchStoreId"
FROM "User" u LEFT JOIN "Branch" b ON b.id = u."branchId"
WHERE (u.role <> 'PLATFORM_OWNER' AND u."storeId" IS NULL)
   OR (u."branchId" IS NOT NULL AND b."storeId" IS DISTINCT FROM u."storeId");

-- Historical migration grouped all pre-tenant data here. Verify ownership with
-- business records; a shared legacy store is not evidence that its users consented.
SELECT s.id, s.slug, u.id AS "userId", u.role
FROM "Store" s LEFT JOIN "User" u ON u."storeId" = s.id
WHERE s.id = '00000000-0000-4000-8000-000000000201';

-- Direct relationships may have been populated by older software or manual SQL.
SELECT 'Expense' AS model, e.id FROM "Expense" e
JOIN "Branch" b ON b.id = e."branchId" JOIN "ExpenseCategory" c ON c.id = e."categoryId"
JOIN "User" u ON u.id = e."createdById"
WHERE e."storeId" <> b."storeId" OR e."storeId" <> c."storeId" OR e."storeId" IS DISTINCT FROM u."storeId"
UNION ALL
SELECT 'Sale', s.id FROM "Sale" s
JOIN "Branch" b ON b.id = s."branchId" JOIN "User" u ON u.id = s."soldById"
LEFT JOIN "Customer" c ON c.id = s."customerId"
WHERE s."storeId" <> b."storeId" OR s."storeId" IS DISTINCT FROM u."storeId" OR s."storeId" <> c."storeId"
UNION ALL
SELECT 'SaleItem', i.id FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Product" p ON p.id = i."productId"
WHERE s."storeId" <> p."storeId"
UNION ALL
SELECT 'Inventory', i.id FROM "Inventory" i JOIN "Branch" b ON b.id = i."branchId" JOIN "Product" p ON p.id = i."productId"
WHERE i."storeId" <> b."storeId" OR i."storeId" <> p."storeId"
UNION ALL
SELECT 'StockBatch', i.id FROM "StockBatch" i JOIN "Branch" b ON b.id = i."branchId" JOIN "Product" p ON p.id = i."productId"
JOIN "User" u ON u.id = i."createdById"
WHERE i."storeId" <> b."storeId" OR i."storeId" <> p."storeId" OR i."storeId" IS DISTINCT FROM u."storeId"
UNION ALL
SELECT 'StockMovement', i.id FROM "StockMovement" i JOIN "Branch" b ON b.id = i."branchId" JOIN "Product" p ON p.id = i."productId"
JOIN "User" u ON u.id = i."createdById"
WHERE i."storeId" <> b."storeId" OR i."storeId" <> p."storeId" OR i."storeId" IS DISTINCT FROM u."storeId"
UNION ALL
SELECT 'Customer', c.id FROM "Customer" c JOIN "Branch" b ON b.id = c."branchId" WHERE c."storeId" <> b."storeId"
UNION ALL
SELECT 'CustomerBranch', l.id FROM "CustomerBranch" l JOIN "Customer" c ON c.id = l."customerId" JOIN "Branch" b ON b.id = l."branchId"
WHERE c."storeId" <> b."storeId"
UNION ALL
SELECT 'Product', p.id FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE p."storeId" <> c."storeId"
UNION ALL
SELECT 'Transfer', tr.id FROM "Transfer" tr JOIN "Branch" a ON a.id = tr."fromBranchId" JOIN "Branch" b ON b.id = tr."toBranchId"
WHERE tr."storeId" <> a."storeId" OR tr."storeId" <> b."storeId"
UNION ALL
SELECT 'TransferItem', i.id FROM "TransferItem" i JOIN "Transfer" tr ON tr.id = i."transferId" JOIN "Product" p ON p.id = i."productId"
WHERE tr."storeId" <> p."storeId"
UNION ALL
SELECT 'TransferAllocation', a.id FROM "TransferAllocation" a JOIN "TransferItem" i ON i.id = a."transferItemId"
JOIN "Transfer" tr ON tr.id = i."transferId" JOIN "StockBatch" b ON b.id = a."stockBatchId"
WHERE tr."storeId" <> b."storeId" OR i."productId" <> b."productId" OR tr."fromBranchId" <> b."branchId"
UNION ALL
SELECT 'SalePayment', p.id FROM "SalePayment" p JOIN "Sale" s ON s.id = p."saleId" JOIN "User" u ON u.id = p."receivedById"
WHERE s."storeId" IS DISTINCT FROM u."storeId"
UNION ALL
SELECT 'Payment', p.id FROM "Payment" p LEFT JOIN "Branch" b ON b.id = p."branchId"
LEFT JOIN "Subscription" s ON s.id = p."subscriptionId" LEFT JOIN "MediaObject" m ON m.id = p."receiptMediaId"
WHERE p."storeId" <> b."storeId" OR p."storeId" <> s."storeId" OR p."storeId" <> m."storeId";
