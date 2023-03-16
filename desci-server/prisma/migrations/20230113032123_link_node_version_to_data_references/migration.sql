-- AlterTable
ALTER TABLE "DataReference" ADD COLUMN     "versionId" INTEGER;

-- AlterTable
ALTER TABLE "PublicDataReference" ADD COLUMN     "versionId" INTEGER;

-- AddForeignKey
ALTER TABLE "DataReference" ADD CONSTRAINT "DataReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NodeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicDataReference" ADD CONSTRAINT "PublicDataReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NodeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
