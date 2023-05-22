/*
  Warnings:

  - You are about to drop the column `organization` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `rorPid` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "organization",
DROP COLUMN "rorPid";

-- CreateTable
CREATE TABLE "Organization" (
    "pid" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("pid")
);

-- CreateTable
CREATE TABLE "UserOrganizations" (
    "organizationId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserOrganizations_pkey" PRIMARY KEY ("userId","organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_pid_key" ON "Organization"("pid");

-- AddForeignKey
ALTER TABLE "UserOrganizations" ADD CONSTRAINT "UserOrganizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("pid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizations" ADD CONSTRAINT "UserOrganizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
