ALTER TABLE "SalePayment"
ADD COLUMN "isDebtPayment" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SalePayment" AS payment
SET "isDebtPayment" = true
FROM "Sale" AS sale
WHERE payment."saleId" = sale.id
  AND payment."createdAt" <> sale."createdAt";

CREATE INDEX "SalePayment_isDebtPayment_createdAt_idx"
ON "SalePayment"("isDebtPayment", "createdAt");
