/*
  Warnings:

  - The primary key for the `Organization` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `pid` on the `Organization` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id` to the `Organization` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserOrganizations" DROP CONSTRAINT "UserOrganizations_organizationId_fkey";

-- DropIndex
DROP INDEX "Organization_pid_key";

-- AlterTable
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_pkey",
DROP COLUMN "pid",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "Organization_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_id_key" ON "Organization"("id");

-- AddForeignKey
ALTER TABLE "UserOrganizations" ADD CONSTRAINT "UserOrganizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
