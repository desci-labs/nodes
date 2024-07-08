-- AlterTable
ALTER TABLE "DistributionPdfs" ADD COLUMN     "contentPagePreviewCid" TEXT,
ADD COLUMN     "frontmatterPagePreviewCid" TEXT;

-- CreateTable
CREATE TABLE "PdfPreviews" (
    "id" SERIAL NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "pdfCid" TEXT NOT NULL,
    "previewMap" JSONB NOT NULL,

    CONSTRAINT "PdfPreviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfPreviews_pdfCid_key" ON "PdfPreviews"("pdfCid");

-- CreateIndex
CREATE UNIQUE INDEX "PdfPreviews_nodeUuid_pdfCid_key" ON "PdfPreviews"("nodeUuid", "pdfCid");

-- AddForeignKey
ALTER TABLE "PdfPreviews" ADD CONSTRAINT "PdfPreviews_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
