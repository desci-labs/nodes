/*
  Warnings:

  - A unique constraint covering the columns `[gitPassAddress]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gitPassAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_gitPassAddress_key" ON "User"("gitPassAddress");
