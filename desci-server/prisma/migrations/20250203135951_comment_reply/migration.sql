-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "replyToId" INTEGER;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Annotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
