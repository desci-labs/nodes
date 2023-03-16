/*
  Warnings:

  - Made the column `providerCount` on table `PublicDataReferenceOnIpfsMirror` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "PublicDataReferenceOnIpfsMirror" ALTER COLUMN "providerCount" SET NOT NULL;
