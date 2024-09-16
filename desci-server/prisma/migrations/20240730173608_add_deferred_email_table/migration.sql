-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('PROTECTED_ATTESTATION');

-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "deferredEmailsId" INTEGER;

-- AlterTable
ALTER TABLE "NodeAttestationReaction" ADD COLUMN     "deferredEmailsId" INTEGER;

-- AlterTable
ALTER TABLE "NodeAttestationVerification" ADD COLUMN     "deferredEmailsId" INTEGER;

-- AlterTable
ALTER TABLE "OrcidPutCodes" ADD COLUMN     "deferredEmailsId" INTEGER;

-- CreateTable
CREATE TABLE "DeferredEmails" (
    "id" SERIAL NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "attestationVersionId" INTEGER,
    "attestationId" INTEGER,
    "userId" INTEGER,
    "desciCommunityId" INTEGER,

    CONSTRAINT "DeferredEmails_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredEmails" ADD CONSTRAINT "DeferredEmails_attestationVersionId_fkey" FOREIGN KEY ("attestationVersionId") REFERENCES "AttestationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_deferredEmailsId_fkey" FOREIGN KEY ("deferredEmailsId") REFERENCES "DeferredEmails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationReaction" ADD CONSTRAINT "NodeAttestationReaction_deferredEmailsId_fkey" FOREIGN KEY ("deferredEmailsId") REFERENCES "DeferredEmails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationVerification" ADD CONSTRAINT "NodeAttestationVerification_deferredEmailsId_fkey" FOREIGN KEY ("deferredEmailsId") REFERENCES "DeferredEmails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcidPutCodes" ADD CONSTRAINT "OrcidPutCodes_deferredEmailsId_fkey" FOREIGN KEY ("deferredEmailsId") REFERENCES "DeferredEmails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
