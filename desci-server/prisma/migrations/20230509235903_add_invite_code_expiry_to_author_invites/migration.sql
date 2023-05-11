/*
  Warnings:

  - You are about to drop the column `phoneNumber` on the `AuthorInvite` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[inviteCode]` on the table `AuthorInvite` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `inviteCode` to the `AuthorInvite` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AuthorInvite_email_key";

-- DropIndex
DROP INDEX "AuthorInvite_phoneNumber_key";

-- AlterTable
ALTER TABLE "AuthorInvite" DROP COLUMN "phoneNumber",
ADD COLUMN     "expired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiredAt" TIMESTAMP(3) NOT NULL DEFAULT '2001-01-01 00:00:00'::timestamp without time zone,
ADD COLUMN     "inviteCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AuthorInvite_inviteCode_key" ON "AuthorInvite"("inviteCode");
