-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('DESCI_PUBLISH', 'DESCI_JOURNALS');

-- AlterTable
ALTER TABLE "JournalEditor" ADD COLUMN     "workload" INTEGER DEFAULT 5;

-- AlterTable
ALTER TABLE "UserNotifications" ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'DESCI_PUBLISH';
