/*
  Warnings:

  - You are about to drop the column `desciCommunityId` on the `DeferredEmails` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_deferredEmailsId_fkey";

-- DropForeignKey
ALTER TABLE "DeferredEmails" DROP CONSTRAINT "DeferredEmails_desciCommunityId_fkey";

-- DropForeignKey
ALTER TABLE "NodeAttestationReaction" DROP CONSTRAINT "NodeAttestationReaction_deferredEmailsId_fkey";

-- DropForeignKey
ALTER TABLE "NodeAttestationVerification" DROP CONSTRAINT "NodeAttestationVerification_deferredEmailsId_fkey";

-- DropForeignKey
ALTER TABLE "OrcidPutCodes" DROP CONSTRAINT "OrcidPutCodes_deferredEmailsId_fkey";

-- AlterTable
ALTER TABLE "DeferredEmails" DROP COLUMN "desciCommunityId";
