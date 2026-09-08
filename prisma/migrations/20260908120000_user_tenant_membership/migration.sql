-- Run deploy/tenant-preflight.sql before deployment. Invalid legacy assignments
-- require an operator-approved mapping; this migration never reassigns records.
BEGIN;

CREATE UNIQUE INDEX "Branch_id_storeId_key" ON "Branch" ("id", "storeId");

ALTER TABLE "User" ADD CONSTRAINT "User_store_membership_check"
    CHECK ("role" = 'PLATFORM_OWNER' OR "storeId" IS NOT NULL) NOT VALID;

-- Keep the original branchId FK (including its ON DELETE SET NULL behavior).
-- This additional FK enforces membership without nulling the user's storeId.
ALTER TABLE "User" ADD CONSTRAINT "User_branch_store_fkey"
    FOREIGN KEY ("branchId", "storeId") REFERENCES "Branch" ("id", "storeId")
    ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "User" VALIDATE CONSTRAINT "User_store_membership_check";
ALTER TABLE "User" VALIDATE CONSTRAINT "User_branch_store_fkey";
COMMIT;
