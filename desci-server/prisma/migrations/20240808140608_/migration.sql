/*
  Warnings:

  - You are about to drop the column `attestationId` on the `DeferredEmails` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DeferredEmails" DROP CONSTRAINT "DeferredEmails_attestationId_fkey";

-- AlterTable
ALTER TABLE "DeferredEmails" DROP COLUMN "attestationId",
ADD COLUMN     "nodeAttestationId" INTEGER;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_nodeAttestationId_fkey" FOREIGN KEY ("nodeAttestationId") REFERENCES "NodeAttestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
