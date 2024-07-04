/*
  Warnings:

  - A unique constraint covering the columns `[uniqueDoi]` on the table `DoiSubmissionQueue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dpid` to the `DoiSubmissionQueue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uniqueDoi` to the `DoiSubmissionQueue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uuid` to the `DoiSubmissionQueue` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DoiSubmissionQueue" DROP CONSTRAINT "DoiSubmissionQueue_doiRecordId_fkey";

-- AlterTable
ALTER TABLE "DoiSubmissionQueue" ADD COLUMN     "dpid" TEXT NOT NULL,
ADD COLUMN     "uniqueDoi" TEXT NOT NULL,
ADD COLUMN     "uuid" TEXT NOT NULL,
ALTER COLUMN "doiRecordId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DoiSubmissionQueue_uniqueDoi_key" ON "DoiSubmissionQueue"("uniqueDoi");

-- AddForeignKey
ALTER TABLE "DoiSubmissionQueue" ADD CONSTRAINT "DoiSubmissionQueue_doiRecordId_fkey" FOREIGN KEY ("doiRecordId") REFERENCES "DoiRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoiSubmissionQueue" ADD CONSTRAINT "DoiSubmissionQueue_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
