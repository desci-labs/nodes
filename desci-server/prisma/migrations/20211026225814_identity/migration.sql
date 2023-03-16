/*
  Warnings:

  - A unique constraint covering the columns `[walletAddress]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pseudonym]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('USER_LOGIN', 'USER_WALLET_ASSOCIATE', 'USER_WALLET_CONNECT', 'USER_DISCOVERY_VOTE', 'USER_COMMENT', 'USER_COMMENT_VOTE', 'USER_REVIEW', 'USER_REVIEW_VOTE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pseudonym" TEXT;

-- CreateTable
CREATE TABLE "InteractionLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "extra" TEXT,
    "action" "ActionType",
    "userId" INTEGER,
    "vaultId" INTEGER,
    "discoveryId" INTEGER,
    "rep" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresIn" INTEGER,
    "tokenId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User.walletAddress_unique" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User.pseudonym_unique" ON "User"("pseudonym");

-- AddForeignKey
ALTER TABLE "InteractionLog" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionLog" ADD FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionLog" ADD FOREIGN KEY ("discoveryId") REFERENCES "Discovery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ChainTransaction_discoveryVoteId_unique" RENAME TO "ChainTransaction.discoveryVoteId_unique";
