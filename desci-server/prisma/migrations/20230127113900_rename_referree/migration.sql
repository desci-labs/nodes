/*
  Warnings:

  - You are about to drop the column `refereeEmail` on the `FriendReferral` table. All the data in the column will be lost.
  - You are about to drop the column `referrerUserId` on the `FriendReferral` table. All the data in the column will be lost.
  - Added the required column `receiverEmail` to the `FriendReferral` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderUserId` to the `FriendReferral` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "FriendReferral" DROP CONSTRAINT "FriendReferral_referrerUserId_fkey";

-- AlterTable
ALTER TABLE "FriendReferral" DROP COLUMN "refereeEmail",
DROP COLUMN "referrerUserId",
ADD COLUMN     "receiverEmail" TEXT NOT NULL,
ADD COLUMN     "senderUserId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "FriendReferral" ADD CONSTRAINT "FriendReferral_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
