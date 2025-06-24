/*
  Warnings:

  - You are about to drop the column `title` on the `JournalSubmission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[dpidAlias]` on the table `Node` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `dpid` on the `JournalSubmission` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `version` on the `JournalSubmission` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "JournalSubmission" DROP COLUMN "title",
DROP COLUMN "dpid",
ADD COLUMN     "dpid" INTEGER NOT NULL,
DROP COLUMN "version",
ADD COLUMN     "version" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Node_dpidAlias_key" ON "Node"("dpidAlias");

-- AddForeignKey
ALTER TABLE "JournalSubmission" ADD CONSTRAINT "JournalSubmission_dpid_fkey" FOREIGN KEY ("dpid") REFERENCES "Node"("dpidAlias") ON DELETE RESTRICT ON UPDATE CASCADE;
