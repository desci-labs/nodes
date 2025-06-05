/*
  Warnings:

  - You are about to drop the column `inviteAcceptedAt` on the `RefereeAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `inviteDeclinedAt` on the `RefereeAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `suggestedAlternatives` on the `RefereeAssignment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RefereeAssignment" DROP COLUMN "inviteAcceptedAt",
DROP COLUMN "inviteDeclinedAt",
DROP COLUMN "suggestedAlternatives",
ADD COLUMN     "completedAssignment" BOOLEAN,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "reassignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RefereeInvite" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "declinedAt" TIMESTAMP(3);
