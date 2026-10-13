-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "photoHash" TEXT;

-- CreateIndex
CREATE INDEX "Analysis_photoHash_idx" ON "Analysis"("photoHash");
