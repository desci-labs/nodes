-- DropIndex
DROP INDEX "PrivateShare_nodeUUID_key";

-- AlterTable
ALTER TABLE "PrivateShare" ADD COLUMN     "memo" TEXT;

-- CreateIndex
CREATE INDEX "PrivateShare_nodeUUID_idx" ON "PrivateShare"("nodeUUID");
