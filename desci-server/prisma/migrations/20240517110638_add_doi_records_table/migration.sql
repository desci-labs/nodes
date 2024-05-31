-- CreateTable
CREATE TABLE "DoiRecord" (
    "id" SERIAL NOT NULL,
    "doi" TEXT NOT NULL,
    "dpid" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoiRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoiRecord_doi_key" ON "DoiRecord"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "DoiRecord_dpid_key" ON "DoiRecord"("dpid");

-- CreateIndex
CREATE UNIQUE INDEX "DoiRecord_uuid_key" ON "DoiRecord"("uuid");

-- AddForeignKey
ALTER TABLE "DoiRecord" ADD CONSTRAINT "DoiRecord_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
