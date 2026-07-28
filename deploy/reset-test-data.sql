BEGIN;

DELETE FROM "AuthHandoff";
DELETE FROM "AuditLog";

DELETE FROM "TransferItem";
DELETE FROM "Transfer";

DELETE FROM "SalePayment";
DELETE FROM "SaleItem";
DELETE FROM "Sale";

DELETE FROM "StockMovement";
DELETE FROM "StockBatch";
DELETE FROM "Inventory";

DELETE FROM "Expense";
DELETE FROM "ExpenseCategory";

DELETE FROM "ProductImage";
DELETE FROM "Product";
DELETE FROM "ProductCategory";

DELETE FROM "Customer";

DELETE FROM "Payment";
DELETE FROM "MediaObject";

DELETE FROM "Branch";
DELETE FROM "User"
WHERE "role" <> 'PLATFORM_OWNER' OR "username" <> :'owner_username';
DELETE FROM "Store";

COMMIT;
