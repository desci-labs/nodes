-- CreateTable
CREATE TABLE "BookmarkedNode" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "shareId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarkedNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookmarkedNode_userId_nodeUuid_key" ON "BookmarkedNode"("userId", "nodeUuid");

-- AddForeignKey
ALTER TABLE "BookmarkedNode" ADD CONSTRAINT "BookmarkedNode_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "PrivateShare"("shareId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkedNode" ADD CONSTRAINT "BookmarkedNode_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkedNode" ADD CONSTRAINT "BookmarkedNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
