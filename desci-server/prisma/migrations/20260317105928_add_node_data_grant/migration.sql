-- CreateTable
CREATE TABLE "NodeDataGrant" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeUUID" TEXT NOT NULL,
    "granteeId" INTEGER NOT NULL,
    "grantedById" INTEGER NOT NULL,
    "memo" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NodeDataGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeDataGrant_nodeUUID_idx" ON "NodeDataGrant"("nodeUUID");

-- CreateIndex
CREATE INDEX "NodeDataGrant_granteeId_idx" ON "NodeDataGrant"("granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeDataGrant_nodeUUID_granteeId_key" ON "NodeDataGrant"("nodeUUID", "granteeId");

-- AddForeignKey
ALTER TABLE "NodeDataGrant" ADD CONSTRAINT "NodeDataGrant_nodeUUID_fkey" FOREIGN KEY ("nodeUUID") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeDataGrant" ADD CONSTRAINT "NodeDataGrant_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeDataGrant" ADD CONSTRAINT "NodeDataGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
