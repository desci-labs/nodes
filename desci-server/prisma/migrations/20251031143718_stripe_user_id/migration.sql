/*
  Warnings:

  - A unique constraint covering the columns `[stripeUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeUserId_key" ON "User"("stripeUserId");
