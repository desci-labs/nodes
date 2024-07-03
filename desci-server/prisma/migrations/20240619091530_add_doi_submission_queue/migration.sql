-- CreateEnum
CREATE TYPE "DoiStatus" AS ENUM ('PENDING', 'FAILED', 'SUCCESS');

-- CreateTable
CREATE TABLE "DoiSubmissionQueue" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doiRecordId" INTEGER NOT NULL,
    "notification" JSONB,
    "status" "DoiStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoiSubmissionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoiSubmissionQueue_batchId_key" ON "DoiSubmissionQueue"("batchId");

-- AddForeignKey
ALTER TABLE "DoiSubmissionQueue" ADD CONSTRAINT "DoiSubmissionQueue_doiRecordId_fkey" FOREIGN KEY ("doiRecordId") REFERENCES "DoiRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
