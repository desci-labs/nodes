-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'ACCOUNT_DELETION_REQUESTED';
ALTER TYPE "ActionType" ADD VALUE 'ACCOUNT_DELETION_CANCELLED';
ALTER TYPE "ActionType" ADD VALUE 'ACCOUNT_DELETION_LOGIN_BLOCKED';
ALTER TYPE "ActionType" ADD VALUE 'ACCOUNT_HARD_DELETED';

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scheduledDeletionAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key" ON "AccountDeletionRequest"("userId");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_scheduledDeletionAt_idx" ON "AccountDeletionRequest"("scheduledDeletionAt");

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
