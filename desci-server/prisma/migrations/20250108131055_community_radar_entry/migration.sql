-- AlterTable
ALTER TABLE "NodeAttestation" ADD COLUMN     "communityRadarEntryId" INTEGER;

-- CreateTable
CREATE TABLE "CommunityRadarEntry" (
    "id" SERIAL NOT NULL,
    "desciCommunityId" INTEGER NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityRadarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRadarEntry_nodeUuid_desciCommunityId_key" ON "CommunityRadarEntry"("nodeUuid", "desciCommunityId");

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_communityRadarEntryId_fkey" FOREIGN KEY ("communityRadarEntryId") REFERENCES "CommunityRadarEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRadarEntry" ADD CONSTRAINT "CommunityRadarEntry_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRadarEntry" ADD CONSTRAINT "CommunityRadarEntry_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
