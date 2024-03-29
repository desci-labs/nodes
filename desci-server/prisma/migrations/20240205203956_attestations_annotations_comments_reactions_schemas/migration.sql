-- CreateEnum
CREATE TYPE "CommunityMembershipRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('COMMENT', 'HIGHLIGHT');

-- AlterTable
ALTER TABLE "DesciCommunity" ADD COLUMN     "image_url" TEXT;

-- CreateTable
CREATE TABLE "CommunityMember" (
    "id" SERIAL NOT NULL,
    "communityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "CommunityMembershipRole" NOT NULL,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttestationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "communityId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "templateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationVersion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "attestationId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttestationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySelectedAttestation" (
    "id" SERIAL NOT NULL,
    "desciCommunityId" INTEGER NOT NULL,
    "attestationId" INTEGER NOT NULL,
    "attestationVersionId" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySelectedAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAttestation" (
    "id" SERIAL NOT NULL,
    "attestationId" INTEGER NOT NULL,
    "attestationVersionId" INTEGER NOT NULL,
    "desciCommunityId" INTEGER NOT NULL,
    "claimedById" INTEGER NOT NULL,
    "nodeDpid10" TEXT NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "nodeVersion" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" SERIAL NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "body" TEXT NOT NULL,
    "highlight" JSONB,
    "authorId" INTEGER NOT NULL,
    "nodeAttestationId" INTEGER NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAttestationReaction" (
    "id" SERIAL NOT NULL,
    "reaction" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "nodeAttestationId" INTEGER NOT NULL,

    CONSTRAINT "NodeAttestationReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAttestationVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeAttestationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeAttestationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_userId_communityId_key" ON "CommunityMember"("userId", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "AttestationTemplate_name_key" ON "AttestationTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Attestation_name_key" ON "Attestation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttestation_nodeUuid_nodeVersion_attestationId_attestat_key" ON "NodeAttestation"("nodeUuid", "nodeVersion", "attestationId", "attestationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttestationVerification_nodeAttestationId_userId_key" ON "NodeAttestationVerification"("nodeAttestationId", "userId");

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AttestationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationVersion" ADD CONSTRAINT "AttestationVersion_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySelectedAttestation" ADD CONSTRAINT "CommunitySelectedAttestation_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySelectedAttestation" ADD CONSTRAINT "CommunitySelectedAttestation_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySelectedAttestation" ADD CONSTRAINT "CommunitySelectedAttestation_attestationVersionId_fkey" FOREIGN KEY ("attestationVersionId") REFERENCES "AttestationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "Attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_attestationVersionId_fkey" FOREIGN KEY ("attestationVersionId") REFERENCES "AttestationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_desciCommunityId_fkey" FOREIGN KEY ("desciCommunityId") REFERENCES "DesciCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestation" ADD CONSTRAINT "NodeAttestation_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "Node"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_nodeAttestationId_fkey" FOREIGN KEY ("nodeAttestationId") REFERENCES "NodeAttestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationReaction" ADD CONSTRAINT "NodeAttestationReaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationReaction" ADD CONSTRAINT "NodeAttestationReaction_nodeAttestationId_fkey" FOREIGN KEY ("nodeAttestationId") REFERENCES "NodeAttestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationVerification" ADD CONSTRAINT "NodeAttestationVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttestationVerification" ADD CONSTRAINT "NodeAttestationVerification_nodeAttestationId_fkey" FOREIGN KEY ("nodeAttestationId") REFERENCES "NodeAttestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
