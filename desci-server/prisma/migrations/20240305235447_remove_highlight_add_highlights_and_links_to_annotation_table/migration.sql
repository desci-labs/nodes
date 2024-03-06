/*
  Warnings:

  - You are about to drop the column `highlight` on the `Annotation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Annotation" DROP COLUMN "highlight",
ADD COLUMN     "highlights" JSONB[] DEFAULT ARRAY[]::JSONB[],
ADD COLUMN     "links" TEXT[] DEFAULT ARRAY[]::TEXT[];
