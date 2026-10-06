-- AlterTable
ALTER TABLE "StockBatch"
    ADD COLUMN "retailPriceUzs" DECIMAL(18,2),
    ADD COLUMN "wholesalePriceUzs" DECIMAL(18,2),
    ADD COLUMN "retailPriceUsd" DECIMAL(10,4),
    ADD COLUMN "wholesalePriceUsd" DECIMAL(10,4);
