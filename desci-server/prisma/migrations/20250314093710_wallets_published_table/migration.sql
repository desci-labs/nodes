-- CreateEnum
CREATE TYPE "WalletProvider" AS ENUM ('GOOGLE', 'ORCID', 'DID');

-- CreateTable
CREATE TABLE "PublishedWallet" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pubKey" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "provider" "WalletProvider" NOT NULL,

    CONSTRAINT "PublishedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishedWallet_userId_idx" ON "PublishedWallet"("userId");

-- CreateIndex
CREATE INDEX "PublishedWallet_nodeUuid_idx" ON "PublishedWallet"("nodeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWallet_pubKey_nodeUuid_provider_key" ON "PublishedWallet"("pubKey", "nodeUuid", "provider");

-- AddForeignKey
ALTER TABLE "PublishedWallet" ADD CONSTRAINT "PublishedWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedWallet" ADD CONSTRAINT "PublishedWallet_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
