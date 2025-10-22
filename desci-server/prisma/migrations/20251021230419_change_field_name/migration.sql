/*
  Warnings:

  - You are about to drop the column `uuid` on the `ImportTaskQueue` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nodeUuid]` on the table `ImportTaskQueue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nodeUuid` to the `ImportTaskQueue` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ImportTaskQueue" DROP CONSTRAINT "ImportTaskQueue_uuid_fkey";

-- AlterTable
ALTER TABLE "ImportTaskQueue" DROP COLUMN "uuid",
ADD COLUMN     "nodeUuid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ImportTaskQueue_nodeUuid_key" ON "ImportTaskQueue"("nodeUuid");

-- AddForeignKey
ALTER TABLE "ImportTaskQueue" ADD CONSTRAINT "ImportTaskQueue_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
