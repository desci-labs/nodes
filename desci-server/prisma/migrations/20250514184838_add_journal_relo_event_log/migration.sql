/*
  Warnings:

  - Added the required column `journalId` to the `JournalEventLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalEventLogAction" ADD VALUE 'EDITOR_INVITED';
ALTER TYPE "JournalEventLogAction" ADD VALUE 'EDITOR_ACCEPTED_INVITE';
ALTER TYPE "JournalEventLogAction" ADD VALUE 'EDITOR_DECLINED_INVITE';

-- AlterTable
ALTER TABLE "JournalEventLog" ADD COLUMN     "journalId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "JournalEventLog" ADD CONSTRAINT "JournalEventLog_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
