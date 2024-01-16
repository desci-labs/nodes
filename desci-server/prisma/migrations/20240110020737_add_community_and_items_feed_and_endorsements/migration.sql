-- AlterTable
ALTER TABLE "User" ADD COLUMN     "desciCommunityId" INTEGER;

-- CreateTable
CREATE TABLE "NodeFeedItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "nodeUuidHex" TEXT NOT NULL,
    "manifestCid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "authors" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,

    CONSTRAINT "NodeFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeFeedItemEndorsement" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "nodeUuidHex" TEXT NOT NULL,
    "nodeDpid10" TEXT NOT NULL,
    "manifestCid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "authors" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeFeedItemId" INTEGER NOT NULL,

    CONSTRAINT "NodeFeedItemEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesciCommunity" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "DesciCommunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeFeedItem_nodeUuid_key" ON "NodeFeedItem"("nodeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "NodeFeedItem_nodeUuidHex_key" ON "NodeFeedItem"("nodeUuidHex");

-- CreateIndex
CREATE UNIQUE INDEX "DesciCommunity_name_key" ON "DesciCommunity"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeFeedItemEndorsement" ADD CONSTRAINT "NodeFeedItemEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeFeedItemEndorsement" ADD CONSTRAINT "NodeFeedItemEndorsement_nodeFeedItemId_fkey" FOREIGN KEY ("nodeFeedItemId") REFERENCES "NodeFeedItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeFeedItemEndorsement" ADD CONSTRAINT "NodeFeedItemEndorsement_id_fkey" FOREIGN KEY ("id") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
