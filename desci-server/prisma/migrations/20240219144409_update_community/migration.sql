-- AlterTable
ALTER TABLE "AttestationTemplate" ADD COLUMN     "desciCommunityId" INTEGER;

-- AddForeignKey
ALTER TABLE "AttestationTemplate" ADD CONSTRAINT "AttestationTemplate_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
