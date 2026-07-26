ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_ACCOUNT_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_SETUP_LINK_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_ENABLED';

CREATE TYPE "HandoffPurpose" AS ENUM ('LOGIN', 'ACCOUNT_SETUP');

ALTER TABLE "Plan"
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Plan"
SET "isPublic" = CASE
    WHEN "code" IN ('START', 'BUSINESS') THEN true
    ELSE false
END;

ALTER TABLE "Store"
ADD COLUMN "billingVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AuthHandoff" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "HandoffPurpose" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthHandoff_tokenHash_key" ON "AuthHandoff"("tokenHash");
CREATE INDEX "AuthHandoff_userId_purpose_usedAt_idx" ON "AuthHandoff"("userId", "purpose", "usedAt");
CREATE INDEX "AuthHandoff_expiresAt_idx" ON "AuthHandoff"("expiresAt");
CREATE INDEX "Plan_isActive_isPublic_idx" ON "Plan"("isActive", "isPublic");

ALTER TABLE "AuthHandoff"
ADD CONSTRAINT "AuthHandoff_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthHandoff"
ADD CONSTRAINT "AuthHandoff_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
