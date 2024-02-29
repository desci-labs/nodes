-- CreateEnum
CREATE TYPE "PublishTaskQueueStatus" AS ENUM ('WAITING', 'PENDING', 'FAILED');

-- CreateTable
CREATE TABLE "PublishTaskQueue" (
    "id" SERIAL NOT NULL,
    "ceramicStream" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "dpid" TEXT,
    "userId" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" "PublishTaskQueueStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishTaskQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishTaskQueue_transactionId_key" ON "PublishTaskQueue"("transactionId");

-- AddForeignKey
ALTER TABLE "PublishTaskQueue" ADD CONSTRAINT "PublishTaskQueue_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTaskQueue" ADD CONSTRAINT "PublishTaskQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
