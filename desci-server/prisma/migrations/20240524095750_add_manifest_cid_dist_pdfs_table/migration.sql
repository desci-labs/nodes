/*
  Warnings:

  - A unique constraint covering the columns `[nodeUuid,originalPdfCid,manifestCid]` on the table `DistributionPdfs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `manifestCid` to the `DistributionPdfs` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "DistributionPdfs_nodeUuid_originalPdfCid_key";

-- AlterTable
ALTER TABLE "DistributionPdfs" ADD COLUMN     "manifestCid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DistributionPdfs_nodeUuid_originalPdfCid_manifestCid_key" ON "DistributionPdfs"("nodeUuid", "originalPdfCid", "manifestCid");
