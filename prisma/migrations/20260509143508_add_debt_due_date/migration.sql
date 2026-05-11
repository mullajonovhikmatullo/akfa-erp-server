-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "debtDueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Sale_debtDueDate_idx" ON "Sale"("debtDueDate");
