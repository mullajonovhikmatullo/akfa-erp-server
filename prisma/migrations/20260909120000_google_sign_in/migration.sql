ALTER TABLE "User"
ADD COLUMN "googleSubject" VARCHAR(255),
ADD COLUMN "googleEmail" VARCHAR(320);

CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

ALTER TYPE "AuditAction" ADD VALUE 'GOOGLE_ACCOUNT_LINKED';
