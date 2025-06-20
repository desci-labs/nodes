-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_ASSIGNMENT_DROPPED';

-- AlterTable
ALTER TABLE "RefereeInvite" ADD COLUMN     "relativeDueDateHrs" INTEGER;
