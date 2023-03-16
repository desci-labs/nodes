-- CreateTable
CREATE TABLE "cidPruneList" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "DataType" NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "deleted" BOOLEAN NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "cidPruneList_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cidPruneList" ADD CONSTRAINT "cidPruneList_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cidPruneList" ADD CONSTRAINT "cidPruneList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
