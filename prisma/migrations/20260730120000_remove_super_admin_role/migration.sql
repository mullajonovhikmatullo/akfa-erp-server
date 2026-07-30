-- Consolidate the legacy SUPER_ADMIN role into STORE_OWNER before removing it
-- from the PostgreSQL enum.
UPDATE "User"
SET "role" = 'STORE_OWNER'
WHERE "role" = 'SUPER_ADMIN';

CREATE TYPE "UserRole_new" AS ENUM (
    'PLATFORM_OWNER',
    'STORE_OWNER',
    'STORE_ADMIN',
    'BRANCH_ADMIN',
    'CASHIER',
    'ADMIN'
);

ALTER TABLE "User"
ALTER COLUMN "role" TYPE "UserRole_new"
USING ("role"::text::"UserRole_new");

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
