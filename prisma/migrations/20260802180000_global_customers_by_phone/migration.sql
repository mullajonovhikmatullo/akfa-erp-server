ALTER TABLE "Customer" ADD COLUMN "normalizedPhone" TEXT;

UPDATE "Customer"
SET "normalizedPhone" = CASE
  WHEN "phone" IS NULL OR regexp_replace("phone", '[^0-9]', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 9
    THEN '+998' || regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '00%'
    THEN '+' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3)
  ELSE '+' || regexp_replace("phone", '[^0-9]', '', 'g')
END;

UPDATE "Customer" SET "phone" = "normalizedPhone" WHERE "normalizedPhone" IS NOT NULL;

CREATE TABLE "CustomerBranch" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerBranch_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CustomerBranch" ("id", "customerId", "branchId", "createdAt")
SELECT md5("id" || ':' || "branchId"), "id", "branchId", "createdAt" FROM "Customer";

CREATE TEMP TABLE "CustomerDuplicateMap" AS
SELECT "id" AS "duplicateId", first_value("id") OVER (
  PARTITION BY "storeId", "normalizedPhone" ORDER BY "createdAt", "id"
) AS "keeperId"
FROM "Customer"
WHERE "normalizedPhone" IS NOT NULL;

DELETE FROM "CustomerDuplicateMap" WHERE "duplicateId" = "keeperId";

INSERT INTO "CustomerBranch" ("id", "customerId", "branchId", "createdAt")
SELECT md5(m."keeperId" || ':' || cb."branchId"), m."keeperId", cb."branchId", cb."createdAt"
FROM "CustomerDuplicateMap" m
JOIN "CustomerBranch" cb ON cb."customerId" = m."duplicateId"
ON CONFLICT DO NOTHING;

UPDATE "Sale" s SET "customerId" = m."keeperId"
FROM "CustomerDuplicateMap" m WHERE s."customerId" = m."duplicateId";

WITH totals AS (
  SELECT m."keeperId", sum(c."balance") AS balance, bool_or(c."isActive") AS active
  FROM (
    SELECT "keeperId", "duplicateId" AS id FROM "CustomerDuplicateMap"
    UNION ALL
    SELECT DISTINCT "keeperId", "keeperId" AS id FROM "CustomerDuplicateMap"
  ) m
  JOIN "Customer" c ON c."id" = m.id
  GROUP BY m."keeperId"
)
UPDATE "Customer" c SET "balance" = totals.balance, "isActive" = totals.active
FROM totals WHERE c."id" = totals."keeperId";

DELETE FROM "CustomerBranch" cb USING "CustomerDuplicateMap" m
WHERE cb."customerId" = m."duplicateId";

DELETE FROM "Customer" c USING "CustomerDuplicateMap" m WHERE c."id" = m."duplicateId";

CREATE UNIQUE INDEX "Customer_storeId_normalizedPhone_key" ON "Customer"("storeId", "normalizedPhone");
CREATE UNIQUE INDEX "CustomerBranch_customerId_branchId_key" ON "CustomerBranch"("customerId", "branchId");
CREATE INDEX "CustomerBranch_branchId_idx" ON "CustomerBranch"("branchId");

ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
