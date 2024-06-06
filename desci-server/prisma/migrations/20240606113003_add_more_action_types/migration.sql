-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'CLAIM_ATTESTATION';
ALTER TYPE "ActionType" ADD VALUE 'REVOKE_CLAIM';
ALTER TYPE "ActionType" ADD VALUE 'CLAIM_ENTRY_ATTESTATIONS';
ALTER TYPE "ActionType" ADD VALUE 'ADD_COMMENT';
ALTER TYPE "ActionType" ADD VALUE 'REMOVE_COMMENT';
ALTER TYPE "ActionType" ADD VALUE 'VERIFY_ATTESTATION';
ALTER TYPE "ActionType" ADD VALUE 'UNVERIFY_ATTESTATION';
ALTER TYPE "ActionType" ADD VALUE 'UPDATE_ORCID_RECORD';
ALTER TYPE "ActionType" ADD VALUE 'REMOVE_ORCID_WORK_RECORD';
ALTER TYPE "ActionType" ADD VALUE 'ORCID_API_ERROR';
