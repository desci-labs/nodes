-- CreateTable
CREATE TABLE "NodeContribution" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contributorId" TEXT NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT NOT NULL,

    CONSTRAINT "NodeContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeContribution_contributorId_key" ON "NodeContribution"("contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeContribution_contributorId_nodeId_userId_key" ON "NodeContribution"("contributorId", "nodeId", "userId");

-- AddForeignKey
ALTER TABLE "NodeContribution" ADD CONSTRAINT "NodeContribution_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeContribution" ADD CONSTRAINT "NodeContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
