/*
  Warnings:

  - You are about to drop the `CommunitySelectedAttestation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CommunitySelectedAttestation" DROP CONSTRAINT "CommunitySelectedAttestation_attestationId_fkey";

-- DropForeignKey
ALTER TABLE "CommunitySelectedAttestation" DROP CONSTRAINT "CommunitySelectedAttestation_attestationVersionId_fkey";

-- DropForeignKey
ALTER TABLE "CommunitySelectedAttestation" DROP CONSTRAINT "CommunitySelectedAttestation_desciCommunityId_fkey";

-- DropTable
DROP TABLE "CommunitySelectedAttestation";

-- CreateTable
CREATE TABLE "CommunityEntryAttestation" (
    "id" SERIAL NOT NULL,
    "desciCommunityId" INTEGER NOT NULL,
    "attestationId" INTEGER NOT NULL,
    "attestationVersionId" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityEntryAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityEntryAttestation_attestationId_attestationVersionI_key" ON "CommunityEntryAttestation"("attestationId", "attestationVersionId", "desciCommunityId");

-- AddForeignKey
ALTER TABLE "CommunityEntryAttestation" ADD CONSTRAINT "CommunityEntryAttestation_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEntryAttestation" ADD CONSTRAINT "CommunityEntryAttestation_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEntryAttestation" ADD CONSTRAINT "CommunityEntryAttestation_attestationVersionId_fkey" FOREIGN KEY ("attestationVersionId") REFERENCES "AttestationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
