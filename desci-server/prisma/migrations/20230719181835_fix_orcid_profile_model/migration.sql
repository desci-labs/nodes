/*
  Warnings:

  - A unique constraint covering the columns `[orcidId]` on the table `OrcidProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orcidId` to the `OrcidProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OrcidProfile" ADD COLUMN     "orcidId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OrcidProfile_orcidId_key" ON "OrcidProfile"("orcidId");

-- CreateIndex
CREATE INDEX "OrcidProfile_orcidId_idx" ON "OrcidProfile"("orcidId");
