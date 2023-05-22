/*
  Warnings:

  - You are about to drop the column `rorpid` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "rorpid",
ADD COLUMN     "rorPid" TEXT[] DEFAULT ARRAY[]::TEXT[];
