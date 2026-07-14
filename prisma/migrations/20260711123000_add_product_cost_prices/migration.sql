ALTER TABLE "Product"
  ADD COLUMN "costPriceUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "costPriceUsd" DECIMAL(10,4);

UPDATE "Product"
SET
  "costPriceUzs" = "wholesalePriceUzs",
  "costPriceUsd" = "wholesalePriceUsd"
WHERE "costPriceUzs" = 0;
