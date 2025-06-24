-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'JOURNAL_EDITOR_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_ASSIGNED_TO_EDITOR';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_REASSIGNED_TO_EDITOR';
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'REFEREE_REVIEW_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'MAJOR_REVISION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'MINOR_REVISION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVISION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_DESK_REJECTION';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_FINAL_REJECTION';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_OVERDUE_EDITOR_REMINDER';
