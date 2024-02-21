-- CreateTable
CREATE TABLE "NodeThumbnails" (
    "id" SERIAL NOT NULL,
    "componentCid" TEXT NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "thumbnails" JSONB NOT NULL,

    CONSTRAINT "NodeThumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeThumbnails_nodeUuid_componentCid_key" ON "NodeThumbnails"("nodeUuid", "componentCid");

-- AddForeignKey
ALTER TABLE "NodeThumbnails" ADD CONSTRAINT "NodeThumbnails_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
