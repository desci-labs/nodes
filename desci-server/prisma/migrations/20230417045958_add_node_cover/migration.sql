-- CreateTable
CREATE TABLE "NodeCover" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "nodeUUID" TEXT NOT NULL,

    CONSTRAINT "NodeCover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeCover_nodeUUID_key" ON "NodeCover"("nodeUUID");

-- AddForeignKey
ALTER TABLE "NodeCover" ADD CONSTRAINT "NodeCover_nodeUUID_fkey" FOREIGN KEY ("nodeUUID") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
