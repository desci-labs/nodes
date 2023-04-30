/*
  Warnings:

  - A unique constraint covering the columns `[orcid]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orcid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User.orcid_unique" ON "User"("orcid");

-- CreateIndex
CREATE INDEX "User.orcid_index" ON "User"("orcid");

-- CreateIndex
CREATE INDEX "User.walletAddress_index" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User.pseudonym_index" ON "User"("pseudonym");
