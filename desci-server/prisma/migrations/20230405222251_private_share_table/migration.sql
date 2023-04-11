/*
  Warnings:

  - A unique constraint covering the columns `[uuid]` on the table `Node` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "PrivateShare" (
    "id" SERIAL NOT NULL,
    "shareId" TEXT NOT NULL,
    "nodeUUID" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrivateShare_shareId_key" ON "PrivateShare"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateShare_nodeUUID_key" ON "PrivateShare"("nodeUUID");

-- CreateIndex
CREATE INDEX "PrivateShare_shareId_idx" ON "PrivateShare"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "Node_uuid_key" ON "Node"("uuid");

-- AddForeignKey
ALTER TABLE "PrivateShare" ADD CONSTRAINT "PrivateShare_nodeUUID_fkey" FOREIGN KEY ("nodeUUID") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
