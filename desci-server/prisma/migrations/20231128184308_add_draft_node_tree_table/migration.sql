-- CreateTable
CREATE TABLE "DraftNodeTree" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "path" TEXT,
    "cid" TEXT NOT NULL,
    "directory" BOOLEAN NOT NULL,
    "size" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DraftNodeTree_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DraftNodeTree" ADD CONSTRAINT "DraftNodeTree_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftNodeTree" ADD CONSTRAINT "DraftNodeTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
