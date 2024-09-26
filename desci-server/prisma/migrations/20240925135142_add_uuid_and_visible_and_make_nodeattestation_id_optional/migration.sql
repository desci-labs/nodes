-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_nodeAttestationId_fkey";

-- AlterTable
ALTER TABLE "Annotation" ADD COLUMN     "nodeId" INTEGER,
ADD COLUMN     "uuid" TEXT,
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "nodeAttestationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_nodeAttestationId_fkey" FOREIGN KEY ("nodeAttestationId") REFERENCES "NodeAttestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
