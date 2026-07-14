-- Normalize existing products before narrowing the PostgreSQL enum.
UPDATE "Product"
SET "unit" = 'PIECE'
WHERE "unit"::text NOT IN ('KG', 'PIECE');

ALTER TYPE "ProductUnit" RENAME TO "ProductUnit_old";
CREATE TYPE "ProductUnit" AS ENUM ('KG', 'PIECE');
ALTER TABLE "Product"
  ALTER COLUMN "unit" TYPE "ProductUnit" USING "unit"::text::"ProductUnit";
DROP TYPE "ProductUnit_old";
