-- AlterTable
ALTER TABLE "RefereeInvite" ADD COLUMN     "userId" INTEGER;

-- AddForeignKey
ALTER TABLE "RefereeInvite" ADD CONSTRAINT "RefereeInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
