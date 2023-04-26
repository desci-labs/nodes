-- DropIndex
DROP INDEX "NodeCover_version_key";

-- CreateIndex
CREATE INDEX "NodeCover_nodeUuid_idx" ON "NodeCover"("nodeUuid");

-- CreateIndex
CREATE INDEX "NodeCover_version_idx" ON "NodeCover"("version");
