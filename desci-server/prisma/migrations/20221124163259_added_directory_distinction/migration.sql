/*
  Warnings:

  - Added the required column `directory` to the `DataReference` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DataReference" ADD COLUMN     "directory" BOOLEAN NOT NULL;
