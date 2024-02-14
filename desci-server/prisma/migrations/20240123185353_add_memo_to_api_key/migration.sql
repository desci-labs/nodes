/*
  Warnings:

  - A unique constraint covering the columns `[memo]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `memo` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "memo" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_memo_key" ON "ApiKey"("memo");
