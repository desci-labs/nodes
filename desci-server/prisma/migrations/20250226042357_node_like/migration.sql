-- CreateTable
CREATE TABLE "NodeLike" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeLike_nodeUuid_userId_key" ON "NodeLike"("nodeUuid", "userId");

-- AddForeignKey
ALTER TABLE "NodeLike" ADD CONSTRAINT "NodeLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeLike" ADD CONSTRAINT "NodeLike_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
