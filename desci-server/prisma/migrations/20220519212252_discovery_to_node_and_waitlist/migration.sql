/*
  Warnings:

  - The values [USER_DISCOVERY_VOTE,USER_COMMENT,USER_COMMENT_VOTE,USER_REVIEW,USER_REVIEW_VOTE] on the enum `ActionType` will be removed. If these variants are still used in the database, this will fail.
  - The values [DISCOVERY_MINT,DISCOVERY_UPDATE,DISCOVERY_VOTE] on the enum `ChainTransactionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `discoveryId` on the `AuthorInvite` table. All the data in the column will be lost.
  - You are about to drop the column `discoveryId` on the `ChainTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `discoveryVoteId` on the `ChainTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `vaultId` on the `ChainTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `discoveryId` on the `InteractionLog` table. All the data in the column will be lost.
  - You are about to drop the column `vaultId` on the `InteractionLog` table. All the data in the column will be lost.
  - You are about to drop the `Discovery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveryAuthor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveryReview` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveryReviewVote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveryVersion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveryVote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vault` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[nodeVoteId]` on the table `ChainTransaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nodeId` to the `AuthorInvite` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NodeState" AS ENUM ('NEW', 'PENDING_DAO_APPROVAL', 'DAO_APPROVED', 'PENDING_VALIDATION', 'VALIDATED', 'WITHDRAWN');

-- AlterEnum
BEGIN;
CREATE TYPE "ActionType_new" AS ENUM ('ORCID_RETRIEVE', 'USER_LOGIN', 'USER_WALLET_ASSOCIATE', 'USER_WALLET_CONNECT', 'USER_NODE_VOTE', 'WAITLIST_ADD');
ALTER TABLE "InteractionLog" ALTER COLUMN "action" TYPE "ActionType_new" USING ("action"::text::"ActionType_new");
ALTER TYPE "ActionType" RENAME TO "ActionType_old";
ALTER TYPE "ActionType_new" RENAME TO "ActionType";
DROP TYPE "ActionType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ChainTransactionType_new" AS ENUM ('NODE_MINT', 'NODE_UPDATE', 'NODE_VOTE');
ALTER TABLE "ChainTransaction" ALTER COLUMN "type" TYPE "ChainTransactionType_new" USING ("type"::text::"ChainTransactionType_new");
ALTER TYPE "ChainTransactionType" RENAME TO "ChainTransactionType_old";
ALTER TYPE "ChainTransactionType_new" RENAME TO "ChainTransactionType";
DROP TYPE "ChainTransactionType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AuthorInvite" DROP CONSTRAINT "AuthorInvite_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "ChainTransaction" DROP CONSTRAINT "ChainTransaction_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "ChainTransaction" DROP CONSTRAINT "ChainTransaction_discoveryVoteId_fkey";

-- DropForeignKey
ALTER TABLE "ChainTransaction" DROP CONSTRAINT "ChainTransaction_vaultId_fkey";

-- DropForeignKey
ALTER TABLE "Discovery" DROP CONSTRAINT "Discovery_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Discovery" DROP CONSTRAINT "Discovery_vaultId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryAuthor" DROP CONSTRAINT "DiscoveryAuthor_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryAuthor" DROP CONSTRAINT "DiscoveryAuthor_userId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryReview" DROP CONSTRAINT "DiscoveryReview_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryReview" DROP CONSTRAINT "DiscoveryReview_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryReviewVote" DROP CONSTRAINT "DiscoveryReviewVote_discoveryReviewId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryReviewVote" DROP CONSTRAINT "DiscoveryReviewVote_userId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryVersion" DROP CONSTRAINT "DiscoveryVersion_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryVote" DROP CONSTRAINT "DiscoveryVote_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "DiscoveryVote" DROP CONSTRAINT "DiscoveryVote_userId_fkey";

-- DropForeignKey
ALTER TABLE "InteractionLog" DROP CONSTRAINT "InteractionLog_discoveryId_fkey";

-- DropForeignKey
ALTER TABLE "InteractionLog" DROP CONSTRAINT "InteractionLog_vaultId_fkey";

-- DropIndex
DROP INDEX "ChainTransaction.discoveryVoteId_unique";

-- AlterTable
ALTER TABLE "AuthorInvite" DROP COLUMN "discoveryId",
ADD COLUMN     "nodeId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ChainTransaction" DROP COLUMN "discoveryId",
DROP COLUMN "discoveryVoteId",
DROP COLUMN "vaultId",
ADD COLUMN     "nodeId" INTEGER,
ADD COLUMN     "nodeVoteId" INTEGER;

-- AlterTable
ALTER TABLE "InteractionLog" DROP COLUMN "discoveryId",
DROP COLUMN "vaultId",
ADD COLUMN     "nodeId" INTEGER,
ADD COLUMN     "waitlistId" INTEGER,
ALTER COLUMN "rep" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationCode" TEXT NOT NULL DEFAULT E'';

-- DropTable
DROP TABLE "Discovery";

-- DropTable
DROP TABLE "DiscoveryAuthor";

-- DropTable
DROP TABLE "DiscoveryReview";

-- DropTable
DROP TABLE "DiscoveryReviewVote";

-- DropTable
DROP TABLE "DiscoveryVersion";

-- DropTable
DROP TABLE "DiscoveryVote";

-- DropTable
DROP TABLE "Vault";

-- DropEnum
DROP TYPE "DiscoveryState";

-- CreateTable
CREATE TABLE "Node" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "cid" TEXT NOT NULL DEFAULT E'',
    "state" "NodeState" NOT NULL DEFAULT E'NEW',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "manifestUrl" TEXT NOT NULL,
    "restBody" JSONB NOT NULL DEFAULT E'{}',
    "replicationFactor" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeVersion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "manifestUrl" TEXT NOT NULL,
    "cid" TEXT NOT NULL DEFAULT E'',
    "transactionId" TEXT,
    "nodeId" INTEGER,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAuthor" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shares" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,

    PRIMARY KEY ("userId","nodeId")
);

-- CreateTable
CREATE TABLE "NodeVote" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voteWeight" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeId" INTEGER NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist.email_unique" ON "Waitlist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ChainTransaction.nodeVoteId_unique" ON "ChainTransaction"("nodeVoteId");

-- AddForeignKey
ALTER TABLE "Node" ADD FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVersion" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionLog" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionLog" ADD FOREIGN KEY ("waitlistId") REFERENCES "Waitlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAuthor" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAuthor" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVote" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVote" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainTransaction" ADD FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainTransaction" ADD FOREIGN KEY ("nodeVoteId") REFERENCES "NodeVote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
