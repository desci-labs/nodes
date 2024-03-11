/*
  Warnings:

  - A unique constraint covering the columns `[name,communityId]` on the table `Attestation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Attestation_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Attestation_name_communityId_key" ON "Attestation"("name", "communityId");
