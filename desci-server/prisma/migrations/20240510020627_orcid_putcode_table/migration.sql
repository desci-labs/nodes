/*
  Warnings:

  - A unique constraint covering the columns `[orcid,uuid,reference]` on the table `OrcidPutCodes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PutcodeReference" AS ENUM ('DATASET', 'SOFTWARE', 'PREPRINT');

-- DropIndex
DROP INDEX "OrcidPutCodes_orcid_uuid_claimId_key";

-- AlterTable
ALTER TABLE "OrcidPutCodes" ADD COLUMN     "reference" "PutcodeReference" NOT NULL DEFAULT 'PREPRINT';

-- CreateIndex
CREATE UNIQUE INDEX "OrcidPutCodes_orcid_uuid_reference_key" ON "OrcidPutCodes"("orcid", "uuid", "reference");
