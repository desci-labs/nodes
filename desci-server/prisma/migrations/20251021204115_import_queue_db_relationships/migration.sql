/*
  Warnings:

  - Added the required column `userId` to the `ImportTaskQueue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ImportTaskQueue" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "ImportTaskQueue" ADD CONSTRAINT "ImportTaskQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTaskQueue" ADD CONSTRAINT "ImportTaskQueue_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
