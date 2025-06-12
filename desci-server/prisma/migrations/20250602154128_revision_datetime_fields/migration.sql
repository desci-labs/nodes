/*
  Warnings:

  - You are about to drop the column `requestedAt` on the `JournalSubmissionRevision` table. All the data in the column will be lost.
  - Made the column `submittedAt` on table `JournalSubmissionRevision` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "JournalSubmissionRevision" DROP COLUMN "requestedAt",
ALTER COLUMN "submittedAt" SET NOT NULL,
ALTER COLUMN "submittedAt" SET DEFAULT CURRENT_TIMESTAMP;
