-- DropForeignKey
ALTER TABLE "JournalEventLog" DROP CONSTRAINT "JournalEventLog_userId_fkey";

-- AlterTable
ALTER TABLE "JournalEventLog" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "JournalEventLog" ADD CONSTRAINT "JournalEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
