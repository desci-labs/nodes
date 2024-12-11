-- AlterTable
ALTER TABLE "Attestation" ADD COLUMN     "canMintDoi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canUpdateOrcid" BOOLEAN NOT NULL DEFAULT false;
