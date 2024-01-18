/*
  Warnings:

  - You are about to drop the column `abstract` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `authors` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `manifestCid` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `nodeDpid10` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nodeDpid10]` on the table `NodeFeedItem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nodeDpid10` to the `NodeFeedItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `desciCommunityId` to the `NodeFeedItemEndorsement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `NodeFeedItemEndorsement` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "NodeFeedItemEndorsement" DROP CONSTRAINT "NodeFeedItemEndorsement_id_fkey";

-- DropIndex
DROP INDEX "NodeFeedItem_nodeUuidHex_key";

-- DropIndex
DROP INDEX "NodeFeedItem_nodeUuid_key";

-- AlterTable
ALTER TABLE "NodeFeedItem" ADD COLUMN     "nodeDpid10" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NodeFeedItemEndorsement" DROP COLUMN "abstract",
DROP COLUMN "authors",
DROP COLUMN "date",
DROP COLUMN "manifestCid",
DROP COLUMN "nodeDpid10",
DROP COLUMN "title",
ADD COLUMN     "desciCommunityId" INTEGER NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NodeFeedItem_nodeDpid10_key" ON "NodeFeedItem"("nodeDpid10");

-- AddForeignKey
ALTER TABLE "NodeFeedItemEndorsement" ADD CONSTRAINT "NodeFeedItemEndorsement_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
