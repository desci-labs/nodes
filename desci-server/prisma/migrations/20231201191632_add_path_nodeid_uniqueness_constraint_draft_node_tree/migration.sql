/*
  Warnings:

  - A unique constraint covering the columns `[nodeId,path]` on the table `DraftNodeTree` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "DraftNodeTree_nodeId_path_key" ON "DraftNodeTree"("nodeId", "path");
