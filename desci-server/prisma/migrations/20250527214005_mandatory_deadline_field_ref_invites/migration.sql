/*
  Warnings:

  - Made the column `relativeDueDateHrs` on table `RefereeInvite` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "RefereeInvite" ALTER COLUMN "relativeDueDateHrs" SET NOT NULL;
