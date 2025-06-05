-- CreateEnum
CREATE TYPE "EditorRole" AS ENUM ('CHIEF_EDITOR', 'ASSOCIATE_EDITOR');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RevisionType" AS ENUM ('MINOR', 'MAJOR');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT');

-- CreateEnum
CREATE TYPE "JournalEventLogAction" AS ENUM ('SUBMISSION_CREATED', 'EDITOR_ASSIGNED', 'SUBMISSION_ACCEPTED', 'SUBMISSION_REJECTED', 'REVISION_REQUESTED', 'REVISION_SUBMITTED', 'DOI_MINTED', 'REFEREE_INVITED', 'REFEREE_ACCEPTED', 'REFEREE_DECLINED', 'REFEREE_REASSIGNED', 'REVIEW_SUBMITTED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('EDITOR_INVITE', 'REFEREE_INVITE', 'SUBMISSION_STATUS_UPDATE', 'REVISION_REQUEST', 'DECISION_NOTIFICATION', 'DOI_MINTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Journal" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconCid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isCommercial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEditor" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "EditorRole" NOT NULL,
    "expertise" TEXT[],
    "inviterId" INTEGER,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "JournalEditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalSubmission" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "dpid" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assignedEditorId" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "doiMintedAt" TIMESTAMP(3),
    "doi" TEXT,
    "userId" INTEGER,

    CONSTRAINT "JournalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalSubmissionRevision" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "dpid" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" "RevisionType" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "comments" TEXT,

    CONSTRAINT "JournalSubmissionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefereeAssignment" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "refereeId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteAcceptedAt" TIMESTAMP(3),
    "inviteDeclinedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "suggestedAlternatives" TEXT[],

    CONSTRAINT "RefereeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalSubmissionReview" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "refereeAssignmentId" INTEGER NOT NULL,
    "recommendation" "ReviewDecision" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalSubmissionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEventLog" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER,
    "userId" INTEGER NOT NULL,
    "action" "JournalEventLogAction" NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorInvite" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "journalId" INTEGER NOT NULL,
    "role" "EditorRole" NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EditorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefereeInvite" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "invitedById" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "declined" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefereeInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalBilling" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "invoicingEmail" TEXT,
    "billingAddress" TEXT,
    "totalDoisMinted" INTEGER NOT NULL DEFAULT 0,
    "totalAmountBilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastInvoiceDate" TIMESTAMP(3),

    CONSTRAINT "JournalBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalInvoice" (
    "id" SERIAL NOT NULL,
    "billingId" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "doisMinted" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "JournalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalEditor_userId_journalId_key" ON "JournalEditor"("userId", "journalId");

-- CreateIndex
CREATE UNIQUE INDEX "RefereeAssignment_submissionId_refereeId_key" ON "RefereeAssignment"("submissionId", "refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorInvite_token_key" ON "EditorInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RefereeInvite_token_key" ON "RefereeInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "JournalBilling_journalId_key" ON "JournalBilling"("journalId");

-- AddForeignKey
ALTER TABLE "JournalEditor" ADD CONSTRAINT "JournalEditor_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEditor" ADD CONSTRAINT "JournalEditor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEditor" ADD CONSTRAINT "JournalEditor_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmission" ADD CONSTRAINT "JournalSubmission_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmission" ADD CONSTRAINT "JournalSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmission" ADD CONSTRAINT "JournalSubmission_assignedEditorId_fkey" FOREIGN KEY ("assignedEditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmission" ADD CONSTRAINT "JournalSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmissionRevision" ADD CONSTRAINT "JournalSubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "JournalSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefereeAssignment" ADD CONSTRAINT "RefereeAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "JournalSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefereeAssignment" ADD CONSTRAINT "RefereeAssignment_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmissionReview" ADD CONSTRAINT "JournalSubmissionReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "JournalSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSubmissionReview" ADD CONSTRAINT "JournalSubmissionReview_refereeAssignmentId_fkey" FOREIGN KEY ("refereeAssignmentId") REFERENCES "RefereeAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEventLog" ADD CONSTRAINT "JournalEventLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "JournalSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEventLog" ADD CONSTRAINT "JournalEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorInvite" ADD CONSTRAINT "EditorInvite_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorInvite" ADD CONSTRAINT "EditorInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefereeInvite" ADD CONSTRAINT "RefereeInvite_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "JournalSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefereeInvite" ADD CONSTRAINT "RefereeInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalBilling" ADD CONSTRAINT "JournalBilling_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalInvoice" ADD CONSTRAINT "JournalInvoice_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "JournalBilling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
