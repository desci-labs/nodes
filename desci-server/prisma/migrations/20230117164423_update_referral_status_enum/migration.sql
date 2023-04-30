/*
  Warnings:

  - Changed the type of `status` on the `FriendReferral` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "FriendReferralStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "FriendReferral" DROP COLUMN "status",
ADD COLUMN     "status" "FriendReferralStatus" NOT NULL;

-- DropEnum
DROP TYPE "ReferralStatus";
