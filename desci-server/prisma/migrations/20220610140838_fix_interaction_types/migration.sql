/*
  Warnings:

  - The values [RETRIEVE_URL,RETRIEVE_URL_FAIL,RETREIVE_URL_SUCCESS] on the enum `NodeState` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'RETRIEVE_URL';
ALTER TYPE "ActionType" ADD VALUE 'RETRIEVE_URL_FAIL';
ALTER TYPE "ActionType" ADD VALUE 'RETREIVE_URL_SUCCESS';

-- AlterEnum
BEGIN;
CREATE TYPE "NodeState_new" AS ENUM ('NEW', 'PENDING_DAO_APPROVAL', 'DAO_APPROVED', 'PENDING_VALIDATION', 'VALIDATED', 'WITHDRAWN');
ALTER TABLE "Node" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "Node" ALTER COLUMN "state" TYPE "NodeState_new" USING ("state"::text::"NodeState_new");
ALTER TYPE "NodeState" RENAME TO "NodeState_old";
ALTER TYPE "NodeState_new" RENAME TO "NodeState";
DROP TYPE "NodeState_old";
ALTER TABLE "Node" ALTER COLUMN "state" SET DEFAULT 'NEW';
COMMIT;

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';

-- AlterTable
ALTER TABLE "MagicLink" ALTER COLUMN "expiresAt" SET DEFAULT now() + '1 hour';
