/*
  Warnings:

  - You are about to drop the column `datasetId` on the `DataReference` table. All the data in the column will be lost.
  - You are about to drop the `Dataset` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `nodeId` to the `DataReference` table without a default value. This is not possible if the table is not empty.
  - Added the required column `root` to the `DataReference` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `DataReference` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('MANIFEST', 'DATASET', 'IMAGES', 'VIDEOS', 'CODE_REPOS');

-- DropForeignKey
ALTER TABLE "DataReference" DROP CONSTRAINT "DataReference_datasetId_fkey";

-- DropForeignKey
ALTER TABLE "Dataset" DROP CONSTRAINT "Dataset_userId_fkey";

-- AlterTable
ALTER TABLE "DataReference" DROP COLUMN "datasetId",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "nodeId" INTEGER NOT NULL,
ADD COLUMN     "root" BOOLEAN NOT NULL,
ADD COLUMN     "type" "DataType" NOT NULL;

-- DropTable
DROP TABLE "Dataset";

-- AddForeignKey
ALTER TABLE "DataReference" ADD CONSTRAINT "DataReference_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
