/*
  Warnings:

  - You are about to drop the column `ceramicComit` on the `PublishStatus` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[commitId]` on the table `PublishStatus` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PublishStatus" DROP COLUMN "ceramicComit",
ADD COLUMN     "ceramicCommit" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "PublishStatus_commitId_key" ON "PublishStatus"("commitId");
