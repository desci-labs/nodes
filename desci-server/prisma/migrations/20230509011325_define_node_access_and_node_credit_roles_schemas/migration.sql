/*
  Warnings:

  - Added the required column `roleId` to the `AuthorInvite` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ResearchCredits" AS ENUM ('AUTHOR', 'CONTRIBUTOR', 'CORRESPONDING_AUTHOR', 'NODE_STEWARD', 'PROGRAM_OFFICER');

-- CreateEnum
CREATE TYPE "ResearchRoles" AS ENUM ('ADMIN', 'VIEWER');

-- DropForeignKey
ALTER TABLE "AuthorInvite" DROP CONSTRAINT "AuthorInvite_receiverId_fkey";

-- AlterTable
ALTER TABLE "AuthorInvite" ADD COLUMN     "roleId" INTEGER NOT NULL,
ALTER COLUMN "receiverId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "NodeCreditRoles" (
    "id" SERIAL NOT NULL,
    "credit" "ResearchCredits" NOT NULL,
    "role" "ResearchRoles" NOT NULL,

    CONSTRAINT "NodeCreditRoles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAccess" (
    "id" SERIAL NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "NodeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeCreditRoles_credit_role_key" ON "NodeCreditRoles"("credit", "role");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAccess_nodeId_userId_key" ON "NodeAccess"("nodeId", "userId");

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD CONSTRAINT "AuthorInvite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "NodeCreditRoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD CONSTRAINT "AuthorInvite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAccess" ADD CONSTRAINT "NodeAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "NodeCreditRoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAccess" ADD CONSTRAINT "NodeAccess_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAccess" ADD CONSTRAINT "NodeAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
