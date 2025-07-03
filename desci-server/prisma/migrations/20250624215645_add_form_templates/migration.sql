-- CreateEnum
CREATE TYPE "FormResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "JournalFormTemplate" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "structure" JSONB NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalFormResponse" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "reviewId" INTEGER,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "formData" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "journalSubmissionId" INTEGER,
    "refereeAssignmentId" INTEGER,

    CONSTRAINT "JournalFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalFormTemplate_journalId_name_version_key" ON "JournalFormTemplate"("journalId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "JournalFormResponse_reviewId_key" ON "JournalFormResponse"("reviewId");

-- AddForeignKey
ALTER TABLE "JournalFormTemplate" ADD CONSTRAINT "JournalFormTemplate_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalFormTemplate" ADD CONSTRAINT "JournalFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalFormResponse" ADD CONSTRAINT "JournalFormResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JournalFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalFormResponse" ADD CONSTRAINT "JournalFormResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "JournalSubmissionReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalFormResponse" ADD CONSTRAINT "JournalFormResponse_journalSubmissionId_fkey" FOREIGN KEY ("journalSubmissionId") REFERENCES "JournalSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalFormResponse" ADD CONSTRAINT "JournalFormResponse_refereeAssignmentId_fkey" FOREIGN KEY ("refereeAssignmentId") REFERENCES "RefereeAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
