/*
  Warnings:

  - You are about to drop the `cidPruneList` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cidPruneList" DROP CONSTRAINT "cidPruneList_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "cidPruneList" DROP CONSTRAINT "cidPruneList_userId_fkey";

-- DropTable
DROP TABLE "cidPruneList";

-- CreateTable
CREATE TABLE "CidPruneList" (
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

    CONSTRAINT "CidPruneList_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CidPruneList" ADD CONSTRAINT "CidPruneList_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CidPruneList" ADD CONSTRAINT "CidPruneList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
