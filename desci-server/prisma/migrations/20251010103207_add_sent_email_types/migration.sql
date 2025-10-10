-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_WELCOME_EMAIL';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_UPGRADE_EMAIL';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_CANCELLATION_EMAIL';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_OUT_OF_CHATS_INITIAL';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_OUT_OF_CHATS_NO_CTA';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_PRO_CHAT_REFRESH';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_STUDENT_DISCOUNT';
ALTER TYPE "SentEmailType" ADD VALUE 'SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED';
