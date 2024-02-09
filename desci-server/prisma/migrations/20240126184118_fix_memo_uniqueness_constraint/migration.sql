/*
  Warnings:

  - A unique constraint covering the columns `[memo,userId]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ApiKey_memo_key";

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_memo_userId_key" ON "ApiKey"("memo", "userId");
