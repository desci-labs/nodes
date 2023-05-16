/*
  Warnings:

  - You are about to drop the column `organisation` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "organisation",
ADD COLUMN     "organization" TEXT DEFAULT '';
