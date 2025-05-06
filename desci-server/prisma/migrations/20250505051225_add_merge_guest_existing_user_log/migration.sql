-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'MERGE_GUEST_INTO_EXISTING_USER_ATTEMPT';
ALTER TYPE "ActionType" ADD VALUE 'MERGE_GUEST_INTO_EXISTING_USER_SUCCESS';
ALTER TYPE "ActionType" ADD VALUE 'MERGE_GUEST_INTO_EXISTING_USER_FAIL';
