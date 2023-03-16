-- DropIndex
DROP INDEX "Invite.email_senderId_unique";

-- DropIndex
DROP INDEX "Invite.phoneNumber_senderId_unique";

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';
