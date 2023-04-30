-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "FriendReferral" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "referrerUserId" INTEGER NOT NULL,
    "referrerUserEmail" TEXT NOT NULL,
    "refereeEmail" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL,

    CONSTRAINT "FriendReferral_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FriendReferral" ADD CONSTRAINT "FriendReferral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
