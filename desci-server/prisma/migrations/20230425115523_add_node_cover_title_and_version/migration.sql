/*
  Warnings:

  - A unique constraint covering the columns `[version]` on the table `NodeCover` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "NodeCover" ADD COLUMN     "name" TEXT,
ADD COLUMN     "version" INTEGER DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "NodeCover_version_key" ON "NodeCover"("version");
