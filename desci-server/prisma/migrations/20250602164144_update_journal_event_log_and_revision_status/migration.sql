/*
  Warnings:

  - Changed the type of `dpid` on the `JournalSubmissionRevision` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `version` on the `JournalSubmissionRevision` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalEventLogAction" ADD VALUE 'REVISION_ACCEPTED';
ALTER TYPE "JournalEventLogAction" ADD VALUE 'REVISION_REJECTED';

-- AlterTable
ALTER TABLE "JournalSubmissionRevision" DROP COLUMN "dpid",
ADD COLUMN     "dpid" INTEGER NOT NULL,
DROP COLUMN "version",
ADD COLUMN     "version" INTEGER NOT NULL;
