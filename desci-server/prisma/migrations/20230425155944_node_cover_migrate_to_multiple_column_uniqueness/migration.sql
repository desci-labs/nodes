/*
  Warnings:

  - A unique constraint covering the columns `[nodeUuid,version]` on the table `NodeCover` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "NodeCover_nodeUuid_idx";

-- DropIndex
DROP INDEX "NodeCover_version_idx";

-- CreateIndex
CREATE UNIQUE INDEX "NodeCover_nodeUuid_version_key" ON "NodeCover"("nodeUuid", "version");
