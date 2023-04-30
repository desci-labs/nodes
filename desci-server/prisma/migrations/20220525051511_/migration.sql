/*
  Warnings:

  - A unique constraint covering the columns `[email,senderId]` on the table `Invite` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phoneNumber,senderId]` on the table `Invite` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Invite.email_unique";

-- DropIndex
DROP INDEX "Invite.phoneNumber_unique";

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phoneNumber" DROP NOT NULL,
ALTER COLUMN "receiverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "isPatron" SET DEFAULT false,
ALTER COLUMN "isWarden" SET DEFAULT false,
ALTER COLUMN "isKeeper" SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Invite.email_senderId_unique" ON "Invite"("email", "senderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite.phoneNumber_senderId_unique" ON "Invite"("phoneNumber", "senderId");
