/*
  Warnings:

  - Added the required column `journalId` to the `JournalSubmissionReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `journalId` to the `RefereeAssignment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JournalSubmissionReview" ADD COLUMN     "authorFeedback" TEXT,
ADD COLUMN     "editorFeedback" TEXT,
ADD COLUMN     "journalId" INTEGER NOT NULL,
ADD COLUMN     "review" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "RefereeAssignment" ADD COLUMN     "journalId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "RefereeAssignment" ADD CONSTRAINT "RefereeAssignment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmissionReview" ADD CONSTRAINT "JournalSubmissionReview_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
