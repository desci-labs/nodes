/*
  Warnings:

  - You are about to drop the column `type` on the `JournalSubmissionRevision` table. All the data in the column will be lost.
  - Added the required column `journalId` to the `JournalSubmissionRevision` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JournalRevisionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "JournalSubmissionRevision" DROP COLUMN "type",
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "journalId" INTEGER NOT NULL,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "status" "JournalRevisionStatus" NOT NULL DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "RevisionType";

-- AddForeignKey
ALTER TABLE "JournalSubmissionRevision" ADD CONSTRAINT "JournalSubmissionRevision_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
