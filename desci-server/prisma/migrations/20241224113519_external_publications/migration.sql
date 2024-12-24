-- CreateTable
CREATE TABLE "ExternalPublications" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "doi" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publishYear" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPublications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExternalPublications" ADD CONSTRAINT "ExternalPublications_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
