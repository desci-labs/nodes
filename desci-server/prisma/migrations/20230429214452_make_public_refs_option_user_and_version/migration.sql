-- DropForeignKey
ALTER TABLE "PublicDataReference" DROP CONSTRAINT "PublicDataReference_userId_fkey";

-- AlterTable
ALTER TABLE "PublicDataReference" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PublicDataReference" ADD CONSTRAINT "PublicDataReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
