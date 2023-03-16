/*
  Warnings:

  - You are about to drop the column `gitcoinPassort` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gitcoinPassport]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_gitcoinPassort_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "gitcoinPassort",
ADD COLUMN     "gitcoinPassport" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_gitcoinPassport_key" ON "User"("gitcoinPassport");
