-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';

-- AlterTable
ALTER TABLE "MagicLink" ALTER COLUMN "expiresAt" SET DEFAULT now() + '1 hour';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "siweNonce" TEXT NOT NULL DEFAULT E'';
