/*
  Warnings:

  - A unique constraint covering the columns `[uuid]` on the table `FriendReferral` will be added. If there are existing duplicate values, this will fail.
  - Made the column `uuid` on table `FriendReferral` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "FriendReferral" ALTER COLUMN "uuid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FriendReferral_uuid_key" ON "FriendReferral"("uuid");
