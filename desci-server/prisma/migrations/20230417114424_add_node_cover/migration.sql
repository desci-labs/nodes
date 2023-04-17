/*
  Warnings:

  - You are about to drop the column `nodeUUID` on the `NodeCover` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nodeUuid]` on the table `NodeCover` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nodeUuid` to the `NodeCover` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "NodeCover" DROP CONSTRAINT "NodeCover_nodeUUID_fkey";

-- DropIndex
DROP INDEX "NodeCover_nodeUUID_key";

-- AlterTable
ALTER TABLE "NodeCover" DROP COLUMN "nodeUUID",
ADD COLUMN     "cid" TEXT,
ADD COLUMN     "nodeUuid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NodeCover_nodeUuid_key" ON "NodeCover"("nodeUuid");

-- AddForeignKey
ALTER TABLE "NodeCover" ADD CONSTRAINT "NodeCover_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
