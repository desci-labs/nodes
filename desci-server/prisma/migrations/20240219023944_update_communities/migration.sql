-- AlterTable
ALTER TABLE "DesciCommunity" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "links" TEXT[],
ADD COLUMN     "memberString" TEXT[],
ADD COLUMN     "subtitle" TEXT;
