/*
  Warnings:

  - A unique constraint covering the columns `[userId,type,nodeUuid,doi,oaWorkId]` on the table `BookmarkedNode` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BookmarkType" AS ENUM ('NODE', 'DOI', 'OA');

-- DropForeignKey
ALTER TABLE "BookmarkedNode" DROP CONSTRAINT "BookmarkedNode_nodeUuid_fkey";

-- DropIndex
DROP INDEX "BookmarkedNode_userId_nodeUuid_key";

-- AlterTable
ALTER TABLE "BookmarkedNode" ADD COLUMN     "doi" TEXT,
ADD COLUMN     "oaWorkId" TEXT,
ADD COLUMN     "type" "BookmarkType" NOT NULL DEFAULT 'NODE',
ALTER COLUMN "nodeUuid" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkedNode_userId_type_nodeUuid_doi_oaWorkId_key" ON "BookmarkedNode"("userId", "type", "nodeUuid", "doi", "oaWorkId");

-- AddForeignKey
ALTER TABLE "BookmarkedNode" ADD CONSTRAINT "BookmarkedNode_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
