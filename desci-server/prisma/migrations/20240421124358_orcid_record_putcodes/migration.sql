-- CreateEnum
CREATE TYPE "ORCIDRecord" AS ENUM ('WORK', 'QUALIFICATION', 'EDUCATION', 'EMPLOYMENT');

-- CreateTable
CREATE TABLE "OrcidPutCodes" (
    "id" SERIAL NOT NULL,
    "orcid" TEXT NOT NULL,
    "putcode" TEXT,
    "record" "ORCIDRecord" NOT NULL,
    "userId" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,

    CONSTRAINT "OrcidPutCodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrcidPutCodes_orcid_record_uuid_key" ON "OrcidPutCodes"("orcid", "record", "uuid");

-- AddForeignKey
ALTER TABLE "OrcidPutCodes" ADD CONSTRAINT "OrcidPutCodes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcidPutCodes" ADD CONSTRAINT "OrcidPutCodes_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
