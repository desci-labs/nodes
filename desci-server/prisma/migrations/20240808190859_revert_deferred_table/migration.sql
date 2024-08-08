/*
  Warnings:

  - You are about to drop the column `nodeAttestationId` on the `DeferredEmails` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DeferredEmails" DROP CONSTRAINT "DeferredEmails_nodeAttestationId_fkey";

-- AlterTable
ALTER TABLE "DeferredEmails" DROP COLUMN "nodeAttestationId",
ADD COLUMN     "attestationId" INTEGER;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
