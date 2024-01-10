/*
  Warnings:

  - You are about to drop the column `nodeUuid` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - You are about to drop the column `nodeUuidHex` on the `NodeFeedItemEndorsement` table. All the data in the column will be lost.
  - Added the required column `nodeDpid10` to the `NodeFeedItemEndorsement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NodeFeedItemEndorsement" DROP COLUMN "nodeUuid",
DROP COLUMN "nodeUuidHex",
ADD COLUMN     "nodeDpid10" TEXT NOT NULL;
