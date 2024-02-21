/*
  Warnings:

  - A unique constraint covering the columns `[attestationId,attestationVersionId,desciCommunityId]` on the table `CommunitySelectedAttestation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "CommunitySelectedAttestation_attestationId_attestationVersi_key" ON "CommunitySelectedAttestation"("attestationId", "attestationVersionId", "desciCommunityId");
