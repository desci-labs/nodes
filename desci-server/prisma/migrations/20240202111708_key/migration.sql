/*
  Warnings:

  - You are about to drop the column `key` on the `ApiKey` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[keyHashed]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `keyHashed` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ApiKey_key_key";

-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "key",
ADD COLUMN     "keyHashed" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHashed_key" ON "ApiKey"("keyHashed");
