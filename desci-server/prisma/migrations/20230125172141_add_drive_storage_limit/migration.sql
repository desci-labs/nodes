-- AlterTable
ALTER TABLE "FriendReferral" ADD COLUMN     "awardedStorage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentDriveStorageLimitGb" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "maxDriveStorageLimitGb" INTEGER NOT NULL DEFAULT 250;
