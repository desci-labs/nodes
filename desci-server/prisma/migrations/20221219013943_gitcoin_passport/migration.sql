/*
  Warnings:

  - You are about to drop the column `gitPassAddress` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gitcoinPassort]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_gitPassAddress_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "gitPassAddress",
ADD COLUMN     "gitcoinPassort" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_gitcoinPassort_key" ON "User"("gitcoinPassort");
