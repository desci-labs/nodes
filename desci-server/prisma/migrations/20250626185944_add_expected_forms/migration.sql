-- AlterTable
ALTER TABLE "RefereeAssignment" ADD COLUMN     "expectedFormTemplateIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "RefereeInvite" ADD COLUMN     "expectedFormTemplateIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
