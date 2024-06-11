-- CreateTable
CREATE TABLE "DistributionPdfs" (
    "id" SERIAL NOT NULL,
    "originalPdfCid" TEXT NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "distPdfCid" TEXT NOT NULL,

    CONSTRAINT "DistributionPdfs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionPdfs_nodeUuid_originalPdfCid_key" ON "DistributionPdfs"("nodeUuid", "originalPdfCid");

-- AddForeignKey
ALTER TABLE "DistributionPdfs" ADD CONSTRAINT "DistributionPdfs_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
