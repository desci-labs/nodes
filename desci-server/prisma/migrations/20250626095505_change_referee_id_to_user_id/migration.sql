/*
  Warnings:

  - You are about to drop the column `refereeId` on the `RefereeAssignment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[submissionId,userId]` on the table `RefereeAssignment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `RefereeAssignment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RefereeAssignment" DROP CONSTRAINT "RefereeAssignment_refereeId_fkey";

-- DropIndex
DROP INDEX "RefereeAssignment_submissionId_refereeId_key";

-- AlterTable
ALTER TABLE "RefereeAssignment" DROP COLUMN "refereeId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefereeAssignment_submissionId_userId_key" ON "RefereeAssignment"("submissionId", "userId");

-- AddForeignKey
ALTER TABLE "RefereeAssignment" ADD CONSTRAINT "RefereeAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
