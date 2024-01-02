/*
  Warnings:

  - A unique constraint covering the columns `[path,versionId]` on the table `PublicDataReference` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PublicDataReference_path_versionId_key" ON "PublicDataReference"("path", "versionId");
