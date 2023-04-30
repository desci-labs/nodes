-- CreateEnum
CREATE TYPE "PublishState" AS ENUM ('WAITING', 'PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "PublicDataReference" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "cid" TEXT NOT NULL,
    "root" BOOLEAN NOT NULL,
    "directory" BOOLEAN NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "DataType" NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PublicDataReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpfsMirror" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT NOT NULL,

    CONSTRAINT "IpfsMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicDataReferenceOnIpfsMirror" (
    "dataReferenceId" INTEGER NOT NULL,
    "mirrorId" INTEGER NOT NULL,
    "status" "PublishState" NOT NULL DEFAULT 'WAITING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PublicDataReferenceOnIpfsMirror_pkey" PRIMARY KEY ("dataReferenceId","mirrorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpfsMirror_name_key" ON "IpfsMirror"("name");

-- AddForeignKey
ALTER TABLE "PublicDataReference" ADD CONSTRAINT "PublicDataReference_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicDataReference" ADD CONSTRAINT "PublicDataReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicDataReferenceOnIpfsMirror" ADD CONSTRAINT "PublicDataReferenceOnIpfsMirror_dataReferenceId_fkey" FOREIGN KEY ("dataReferenceId") REFERENCES "PublicDataReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicDataReferenceOnIpfsMirror" ADD CONSTRAINT "PublicDataReferenceOnIpfsMirror_mirrorId_fkey" FOREIGN KEY ("mirrorId") REFERENCES "IpfsMirror"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
