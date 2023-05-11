/*
  Warnings:

  - You are about to drop the column `expiredAt` on the `AuthorInvite` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AuthorInviteStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'PENDING', 'EXPIRED');

-- AlterTable
ALTER TABLE "AuthorInvite" DROP COLUMN "expiredAt",
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + '01:00:00'::interval),
ADD COLUMN     "status" "AuthorInviteStatus" NOT NULL DEFAULT 'PENDING';
