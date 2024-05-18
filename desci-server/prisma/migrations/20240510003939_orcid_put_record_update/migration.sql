/*
  Warnings:

  - A unique constraint covering the columns `[orcid,uuid,claimId]` on the table `OrcidPutCodes` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "OrcidPutCodes_orcid_record_uuid_key";

-- AlterTable
ALTER TABLE "OrcidPutCodes" ADD COLUMN     "claimId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "OrcidPutCodes_orcid_uuid_claimId_key" ON "OrcidPutCodes"("orcid", "uuid", "claimId");

-- AddForeignKey
ALTER TABLE "OrcidPutCodes" ADD CONSTRAINT "OrcidPutCodes_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NodeAttestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
