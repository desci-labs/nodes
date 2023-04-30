/*
  Warnings:

  - You are about to drop the column `inviteId` on the `MagicLink` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `MagicLink` table. All the data in the column will be lost.
  - Added the required column `email` to the `MagicLink` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MagicLink" DROP CONSTRAINT "MagicLink_inviteId_fkey";

-- DropForeignKey
ALTER TABLE "MagicLink" DROP CONSTRAINT "MagicLink_userId_fkey";

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';

-- AlterTable
ALTER TABLE "MagicLink" DROP COLUMN "inviteId",
DROP COLUMN "userId",
ADD COLUMN     "email" TEXT NOT NULL,
ALTER COLUMN "expiresAt" SET DEFAULT now() + '1 hour';
