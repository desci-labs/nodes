/**
 * Hard-delete a user and all their data. Used only by the account-deletion cron worker.
 * Runs in a single transaction; order respects FK constraints.
 */
import { ActionType, Prisma } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'AccountDeletionService' });

async function deleteSubmissionsAndChildren(tx: Prisma.TransactionClient, submissionIds: number[]): Promise<void> {
  if (submissionIds.length === 0) return;
  const assignmentIds = (
    await tx.refereeAssignment.findMany({
      where: { submissionId: { in: submissionIds } },
      select: { id: true },
    })
  ).map((a) => a.id);
  await tx.journalFormResponse.deleteMany({
    where: {
      OR: [
        { journalSubmissionId: { in: submissionIds } },
        ...(assignmentIds.length > 0 ? [{ refereeAssignmentId: { in: assignmentIds } }] : []),
      ],
    },
  });
  await tx.refereeInvite.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await tx.journalSubmissionReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await tx.refereeAssignment.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await tx.journalEventLog.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await tx.journalSubmissionRevision.deleteMany({ where: { submissionId: { in: submissionIds } } });
}

export async function hardDeleteUser(userId: number): Promise<void> {
  const start = new Date();
  logger.info({ userId, startedAt: start }, 'Hard delete started');

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. AccountDeletionRequest (references User)
        await tx.accountDeletionRequest.deleteMany({ where: { userId } });

        // 2. Billing: Invoice (references User, Subscription), then PaymentMethod, Subscription
        await tx.invoice.deleteMany({ where: { userId } });
        await tx.paymentMethod.deleteMany({ where: { userId } });
        await tx.subscription.deleteMany({ where: { userId } });

        // 3. Auth & identity
        await tx.authToken.deleteMany({ where: { userId } });
        await tx.userIdentity.deleteMany({ where: { userId } });
        await tx.apiKey.deleteMany({ where: { userId } });

        // 4. User-scoped feature data
        await tx.userFeatureLimit.deleteMany({ where: { userId } });
        await tx.userNotifications.deleteMany({ where: { userId } });
        await tx.sentEmail.deleteMany({ where: { userId } });
        await tx.deferredEmails.deleteMany({ where: { userId } });
        await tx.bookmarkedNode.deleteMany({ where: { userId } });
        await tx.abandonedCheckout.deleteMany({ where: { userId } });
        await tx.userOrganizations.deleteMany({ where: { userId } });
        await tx.friendReferral.deleteMany({ where: { senderUserId: userId } });
        await tx.orcidPutCodes.deleteMany({ where: { userId } });
        await tx.dataMigration.deleteMany({ where: { userId } });
        await tx.guestDataReference.deleteMany({ where: { userId } });
        await tx.uploadJobs.deleteMany({ where: { userId } });
        await tx.publishTaskQueue.deleteMany({ where: { userId } });
        await tx.nodeContribution.deleteMany({ where: { userId } });
        await tx.importTaskQueue.deleteMany({ where: { userId } });
        await tx.externalApiUsage.deleteMany({ where: { userId } });
        await tx.annotation.deleteMany({ where: { authorId: userId } });
        await tx.nodeAttestation.deleteMany({ where: { claimedById: userId } });
        await tx.nodeAttestationVerification.deleteMany({ where: { userId } });
        await tx.nodeAttestationReaction.deleteMany({ where: { authorId: userId } });
        await tx.commentVote.deleteMany({ where: { userId } });
        await tx.nodeLike.deleteMany({ where: { userId } });
        await tx.communitySubmission.deleteMany({ where: { userId } });
        await tx.publishedWallet.deleteMany({ where: { userId } });

        // 5. Waitlist (userId optional)
        await tx.waitlist.updateMany({ where: { userId }, data: { userId: null } });

        // 6. Journal-related: editor, referee assignments/invites, form templates
        await tx.journalEditor.deleteMany({ where: { userId } });
        await tx.refereeAssignment.deleteMany({ where: { userId } });
        await tx.refereeInvite.deleteMany({ where: { userId } });
        await tx.editorInvite.deleteMany({ where: { inviterId: userId } });
        await tx.journalFormTemplate.deleteMany({ where: { createdById: userId } });
        await tx.journalEventLog.updateMany({ where: { userId }, data: { userId: null } });

        // Submissions authored by user: delete children then submissions
        const authoredSubmissionIds = (
          await tx.journalSubmission.findMany({ where: { authorId: userId }, select: { id: true } })
        ).map((s) => s.id);
        await deleteSubmissionsAndChildren(tx, authoredSubmissionIds);
        await tx.journalSubmission.deleteMany({ where: { authorId: userId } });
        await tx.journalSubmission.updateMany({
          where: { assignedEditorId: userId },
          data: { assignedEditorId: null },
        });

        // 7. Community
        await tx.communityMember.deleteMany({ where: { userId } });
        await tx.nodeFeedItemEndorsement.deleteMany({ where: { userId } });

        // 8. Invites, NodeAuthor, NodeVote, ChainTransaction, Wallet, OAuth, CidPruneList, DraftNodeTree
        await tx.authorInvite.deleteMany({ where: { senderId: userId } });
        await tx.authorInvite.deleteMany({ where: { receiverId: userId } });
        await tx.invite.deleteMany({ where: { senderId: userId } });
        await tx.invite.updateMany({ where: { receiverId: userId }, data: { receiverId: null } });
        await tx.nodeAuthor.deleteMany({ where: { userId } });
        await tx.nodeVote.deleteMany({ where: { userId } });
        await tx.chainTransaction.updateMany({ where: { userId }, data: { userId: null } });
        await tx.chainTransaction.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } });
        await tx.wallet.deleteMany({ where: { userId } });
        await tx.oauthAccessGrant.deleteMany({ where: { userId } });
        await tx.oauthAccessToken.deleteMany({ where: { userId } });
        await tx.cidPruneList.deleteMany({ where: { userId } });
        // DraftNodeTree has nodeId only; deleted per-node below

        // 9. InteractionLog (references User); keep ACCOUNT_HARD_DELETED audit entry
        await tx.interactionLog.deleteMany({
          where: { userId, action: { not: ActionType.ACCOUNT_HARD_DELETED } },
        });

        // 10. Nodes owned by user: delete node-dependent tables then nodes
        const nodes = await tx.node.findMany({
          where: { ownerId: userId },
          select: { id: true, uuid: true, dpidAlias: true },
        });
        const nodeIds = nodes.map((n) => n.id);
        const nodeUuids = nodes.map((n) => n.uuid).filter((u): u is string => u != null);
        const nodeDpids = nodes.map((n) => n.dpidAlias).filter((d): d is number => d != null);

        if (nodeIds.length > 0) {
          await tx.authorInvite.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.chainTransaction.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.nodeVote.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.nodeVersion.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.dataReference.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.publicDataReference.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.cidPruneList.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.nodeCover.deleteMany({ where: { node: { id: { in: nodeIds } } } });
          await tx.uploadJobs.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.draftNodeTree.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.nodeAttestation.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.nodeThumbnails.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.publishTaskQueue.deleteMany({ where: { uuid: { in: nodeUuids } } });
          await tx.nodeContribution.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.privateShare.deleteMany({ where: { nodeUUID: { in: nodeUuids } } });
          await tx.distributionPdfs.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.pdfPreviews.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.doiRecord.deleteMany({ where: { uuid: { in: nodeUuids } } });
          await tx.doiSubmissionQueue.deleteMany({ where: { uuid: { in: nodeUuids } } });
          await tx.deferredEmails.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.userNotifications.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.annotation.deleteMany({ where: { uuid: { in: nodeUuids } } });
          await tx.publishStatus.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.externalPublications.deleteMany({ where: { uuid: { in: nodeUuids } } });
          await tx.communityRadarEntry.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.nodeLike.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.communitySubmission.deleteMany({ where: { nodeId: { in: nodeUuids } } });
          await tx.publishedWallet.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.guestDataReference.deleteMany({ where: { nodeId: { in: nodeIds } } });
          // DataMigration is user-scoped only (deleted above by userId)
          // Journal submissions linked to these nodes (by dpid): delete children then submissions
          if (nodeDpids.length > 0) {
            const nodeLinkedSubmissionIds = (
              await tx.journalSubmission.findMany({
                where: { dpid: { in: nodeDpids } },
                select: { id: true },
              })
            ).map((s) => s.id);
            await deleteSubmissionsAndChildren(tx, nodeLinkedSubmissionIds);
            await tx.journalSubmission.deleteMany({ where: { dpid: { in: nodeDpids } } });
          }
          await tx.importTaskQueue.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.interactionLog.deleteMany({ where: { nodeId: { in: nodeIds } } });
          await tx.bookmarkedNode.deleteMany({ where: { nodeUuid: { in: nodeUuids } } });
          await tx.node.deleteMany({ where: { ownerId: userId } });
        }

        // 11. User
        await tx.user.delete({ where: { id: userId } });

        logger.info(
          { userId, durationMs: new Date().getTime() - start.getTime() },
          'Hard delete transaction finishing',
        );
      },
      { maxWait: 10000, timeout: 60000 },
    );
    logger.info({ userId }, 'Hard delete completed');
  } catch (err) {
    const durationMs = new Date().getTime() - start.getTime();
    logger.error({ err, userId, durationMs }, 'Hard delete transaction failed');
    throw err;
  }
}
