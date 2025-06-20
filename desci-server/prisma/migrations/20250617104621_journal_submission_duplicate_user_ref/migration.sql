/*
  Warnings:

  - You are about to drop the column `userId` on the `JournalSubmission` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "JournalSubmission" DROP CONSTRAINT "JournalSubmission_userId_fkey";

-- AlterTable
ALTER TABLE "JournalSubmission" DROP COLUMN "userId";
