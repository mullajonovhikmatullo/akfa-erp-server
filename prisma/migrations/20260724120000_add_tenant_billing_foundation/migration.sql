-- Extend existing roles without deleting legacy values. Existing SUPER_ADMIN/ADMIN
-- accounts are kept compatible and mapped in application code during migration.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STORE_OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STORE_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BRANCH_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CASHIER';

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "PlanCode" AS ENUM ('START', 'BUSINESS', 'NETWORK');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PaymentCurrency" AS ENUM ('UZS', 'USD');
CREATE TYPE "AuditAction" AS ENUM ('STORE_REGISTERED', 'STORE_STATUS_CHANGED', 'PAYMENT_CREATED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'SUBSCRIPTION_EXTENDED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPriceUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxProducts" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'TRIALING',
    "planId" TEXT,
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextPaymentDueAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "PaymentCurrency" NOT NULL DEFAULT 'UZS',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Seed baseline plans for onboarding and manual billing.
INSERT INTO "Plan" ("id", "code", "name", "monthlyPriceUzs", "maxBranches", "maxUsers", "maxProducts", "isActive", "createdAt", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000101', 'START', 'Start', 199000, 1, 3, 1000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000102', 'BUSINESS', 'Business', 399000, 5, 20, 10000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000103', 'NETWORK', 'Network', 0, NULL, NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Preserve existing single-store data inside a default active tenant.
INSERT INTO "Store" ("id", "name", "slug", "ownerName", "status", "planId", "trialStartedAt", "trialEndsAt", "activatedAt", "createdAt", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000201', 'Default Store', 'default-store', 'Default Owner', 'ACTIVE', '00000000-0000-4000-8000-000000000101', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Subscription" ("id", "storeId", "planId", "status", "trialStartedAt", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd", "nextPaymentDueAt", "createdAt", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 month', CURRENT_TIMESTAMP + INTERVAL '1 month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Tenant columns for existing operational tables.
ALTER TABLE "Branch" ADD COLUMN "storeId" TEXT;
ALTER TABLE "User" ADD COLUMN "storeId" TEXT;
ALTER TABLE "ProductCategory" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Inventory" ADD COLUMN "storeId" TEXT;
ALTER TABLE "StockBatch" ADD COLUMN "storeId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "storeId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Transfer" ADD COLUMN "storeId" TEXT;

UPDATE "Branch" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "User" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "ProductCategory" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Product" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Inventory" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "StockBatch" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "StockMovement" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Customer" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Sale" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "ExpenseCategory" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Expense" SET "storeId" = '00000000-0000-4000-8000-000000000201';
UPDATE "Transfer" SET "storeId" = '00000000-0000-4000-8000-000000000201';

-- Branch names were not unique before tenant support. Normalize duplicates before adding the tenant-scoped unique index.
WITH ranked_branches AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "storeId", "name" ORDER BY "createdAt", "id") AS rn
    FROM "Branch"
)
UPDATE "Branch" b
SET "name" = b."name" || ' ' || ranked_branches.rn
FROM ranked_branches
WHERE b."id" = ranked_branches."id" AND ranked_branches.rn > 1;

ALTER TABLE "Branch" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ProductCategory" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Inventory" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "StockBatch" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ExpenseCategory" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Transfer" ALTER COLUMN "storeId" SET NOT NULL;

-- Replace global unique constraints with tenant-scoped constraints.
DROP INDEX IF EXISTS "ProductCategory_name_key";
DROP INDEX IF EXISTS "Product_sku_key";
DROP INDEX IF EXISTS "ExpenseCategory_name_key";

-- Indexes
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_isActive_idx" ON "Plan"("isActive");

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "Store_status_idx" ON "Store"("status");
CREATE INDEX "Store_planId_idx" ON "Store"("planId");
CREATE INDEX "Store_trialEndsAt_idx" ON "Store"("trialEndsAt");
CREATE INDEX "Store_createdAt_idx" ON "Store"("createdAt");

CREATE UNIQUE INDEX "Subscription_storeId_key" ON "Subscription"("storeId");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_trialEndsAt_idx" ON "Subscription"("trialEndsAt");
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

CREATE INDEX "Payment_storeId_idx" ON "Payment"("storeId");
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

CREATE INDEX "AuditLog_storeId_idx" ON "AuditLog"("storeId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE UNIQUE INDEX "Branch_storeId_name_key" ON "Branch"("storeId", "name");
CREATE INDEX "Branch_storeId_idx" ON "Branch"("storeId");
CREATE INDEX "User_storeId_idx" ON "User"("storeId");
CREATE UNIQUE INDEX "ProductCategory_storeId_name_key" ON "ProductCategory"("storeId", "name");
CREATE INDEX "ProductCategory_storeId_idx" ON "ProductCategory"("storeId");
CREATE UNIQUE INDEX "Product_storeId_sku_key" ON "Product"("storeId", "sku");
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");
CREATE INDEX "Inventory_storeId_idx" ON "Inventory"("storeId");
CREATE INDEX "StockBatch_storeId_idx" ON "StockBatch"("storeId");
CREATE INDEX "StockMovement_storeId_idx" ON "StockMovement"("storeId");
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE INDEX "Sale_storeId_idx" ON "Sale"("storeId");
CREATE UNIQUE INDEX "ExpenseCategory_storeId_name_key" ON "ExpenseCategory"("storeId", "name");
CREATE INDEX "ExpenseCategory_storeId_idx" ON "ExpenseCategory"("storeId");
CREATE INDEX "Expense_storeId_idx" ON "Expense"("storeId");
CREATE INDEX "Transfer_storeId_idx" ON "Transfer"("storeId");

-- Foreign keys
ALTER TABLE "Store" ADD CONSTRAINT "Store_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
