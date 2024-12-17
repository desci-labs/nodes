-- CreateTable
CREATE TABLE "PublishStatus" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "versionId" INTEGER,
    "commitId" TEXT,
    "ceramicComit" BOOLEAN,
    "assignDpid" BOOLEAN,
    "createPdr" BOOLEAN,
    "fireDeferredEmails" BOOLEAN,
    "fireNotifications" BOOLEAN,
    "updateAttestations" BOOLEAN,
    "transformDraftComments" BOOLEAN,
    "triggerDoiMint" BOOLEAN,

    CONSTRAINT "PublishStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishStatus_nodeUuid_key" ON "PublishStatus"("nodeUuid");

-- CreateIndex
CREATE INDEX "PublishStatus_nodeUuid_idx" ON "PublishStatus"("nodeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PublishStatus_nodeUuid_version_key" ON "PublishStatus"("nodeUuid", "version");

-- AddForeignKey
ALTER TABLE "PublishStatus" ADD CONSTRAINT "PublishStatus_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NodeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishStatus" ADD CONSTRAINT "PublishStatus_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
