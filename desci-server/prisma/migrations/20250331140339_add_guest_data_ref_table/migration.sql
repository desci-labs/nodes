-- CreateTable
CREATE TABLE "GuestDataReference" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cid" TEXT NOT NULL,
    "root" BOOLEAN NOT NULL,
    "rootCid" TEXT,
    "path" TEXT,
    "directory" BOOLEAN NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "DataType" NOT NULL,
    "external" BOOLEAN,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "loggedData" JSONB NOT NULL,

    CONSTRAINT "GuestDataReference_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GuestDataReference" ADD CONSTRAINT "GuestDataReference_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDataReference" ADD CONSTRAINT "GuestDataReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
