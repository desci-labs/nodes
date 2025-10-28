-- AlterTable
ALTER TABLE "SentEmail" ADD COLUMN     "internalTrackingId" TEXT;

-- CreateIndex
CREATE INDEX "SentEmail_internalTrackingId_idx" ON "SentEmail"("internalTrackingId");

-- CreateIndex
CREATE INDEX "SentEmail_internalTrackingId_emailType_idx" ON "SentEmail"("internalTrackingId", "emailType");
