import { DataType, EmailType, Node, NodeContribution, NodeVersion, Prisma, PublishStatus, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { SENDGRID_API_KEY, SHOULD_SEND_EMAIL } from '../config.js';
import { prisma } from '../client.js';
import { getNodeVersion } from '../controllers/communities/util.js';
import { createOrUpgradeDpidAlias, handlePublicDataRefs } from '../controllers/nodes/publish.js';
import { logger as parentLogger } from '../logger.js';
import { SubmissionPackageEmailHtml } from '../templates/emails/utils/emailRenderer.js';
import { getIndexedResearchObjects, getTimeForTxOrCommits } from '../theGraph.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { attestationService } from './Attestation.js';
import { contributorService } from './Contributors.js';
import { getManifestFromNode } from './data/processing.js';
import { getLatestManifestFromNode } from './manifestRepo.js';
import { NotificationService } from './Notifications/NotificationService.js';
import { NODES_SUBJECT_PREFIX } from './email/email.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const logger = parentLogger.child({
  module: 'Services::PublishServices',
});

async function sendVersionUpdateEmailToAllContributors({
  node,
  manuscriptCid,
  ownerOnly,
  verifiedOnly = false,
}: {
  node: Node;
  manuscriptCid: string;
  ownerOnly?: boolean;
  verifiedOnly?: boolean;
}) {
  const contributors = ownerOnly
    ? []
    : await contributorService.retrieveAllContributionsForNode({
        node,
        verifiedOnly,
        withEmailOnly: true,
        nonDeniedOnly: true,
      });
  const nodeOwner = await prisma.user.findUnique({ where: { id: node.ownerId } });
  const manifest = await getLatestManifestFromNode(node);
  const dpid = node.dpidAlias?.toString() ?? manifest.dpid?.id;
  const versionPublished = await getNodeVersion(node.uuid);
  // debugger; ////
  if (!dpid) {
    logger.error(
      {
        nodeUuid: node.uuid,
        'manifest.dpid': manifest?.dpid,
        dpidAlias: node.dpidAlias,
        nodeOwner,
        totalContributors: contributors.length,
      },
      'Failed to retrieve DPID for node, emails not sent during publish update.',
    );
  }

  const ownerEmailIncluded = contributors.find((c) => c.userId === nodeOwner.id);
  // debugger; //
  if (!ownerEmailIncluded) {
    // Add the owner to the email list incase they forgot to add themselves as a contributor
    const ownerContributor = {
      email: nodeOwner.email,
      name: nodeOwner.name,
      verified: true,
    } as unknown as NodeContribution & {
      user: User;
    };
    contributors.push(ownerContributor);
  }
  // debugger; ////
  const emailPromises = contributors.map(async (contributor) => {
    // debugger;
    const shareCode = await contributorService.generatePrivShareCodeForContribution(contributor, node);
    const emailHtml = SubmissionPackageEmailHtml({
      nodeOwner: nodeOwner.name,
      nodeUuid: node.uuid,
      nodeTitle: node.title,
      nodeDpid: dpid,
      versionUpdate: versionPublished.toString(),
      manuscriptCid: manuscriptCid,
      contributorId: contributor.contributorId,
      isNodeOwner: contributor.userId === nodeOwner.id,
      isAlreadyVerified: contributor.verified ?? false,
      privShareCode: shareCode,
    });

    const emailMsg = {
      to: contributor.email ?? contributor.user?.email,
      from: 'no-reply@desci.com',
      subject: `${NODES_SUBJECT_PREFIX} Your submission package is ready`,
      text: `${nodeOwner.name} has published their research object titled "${node.title}" that you have contributed to.`,
      html: emailHtml,
    };
    return { contributor, emailMsg };
  });

  if (SHOULD_SEND_EMAIL && SENDGRID_API_KEY) {
    const results = await Promise.allSettled(
      emailPromises.map(async (emailPromiseEntry) => {
        const emailEntry = await emailPromiseEntry;
        if (!emailEntry.contributor.inviteSent) {
          // Set invite sent flag to true
          await prisma.nodeContribution.update({
            where: { id: emailEntry.contributor.id },
            data: { inviteSent: true },
          });
        }
        return sgMail.send(emailEntry.emailMsg);
      }),
    );

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failureCount = results.filter((r) => r.status === 'rejected').length;

    logger.info(
      {
        totalEmails: results.length,
        successCount,
        failureCount,
        failedEmails: results
          .map((r, i) =>
            r.status === 'rejected'
              ? {
                  index: i,
                  reason: (r as PromiseRejectedResult).reason?.message,
                }
              : null,
          )
          .filter(Boolean),
      },
      'Submission package email sending complete',
    );
  } else {
    logger.info({ nodeEnv: process.env.NODE_ENV }, 'Skipping add contributor email send in non-production environment');
  }

  return true;
}

async function retrieveBlockTimeByManifestCid(uuid: string, manifestCid: string) {
  if (!manifestCid) return Date.now().toString();
  const manifestPubRefEntry = await prisma.publicDataReference.findFirst({
    select: {
      createdAt: true,
      size: true,
      external: true,
      cid: true,
      nodeVersion: {
        select: {
          transactionId: true,
          commitId: true,
        },
      },
    },
    where: {
      type: { equals: DataType.MANIFEST },
      node: {
        uuid: ensureUuidEndsWithDot(uuid),
      },
      cid: manifestCid,
    },
  });
  const commitId = manifestPubRefEntry?.nodeVersion?.commitId ?? manifestPubRefEntry?.nodeVersion?.transactionId;
  const timeMap = await getTimeForTxOrCommits([commitId]);
  const timestamp = timeMap[commitId];
  return timestamp ?? Date.now().toString();
}

type HandleDeferredEmailsContext = {
  isNodePublished?: boolean;
  publishedVersionCount?: number;
};

async function getPublishedVersionCount(nodeUuid: string): Promise<number> {
  return prisma.nodeVersion.count({
    where: {
      node: {
        uuid: ensureUuidEndsWithDot(nodeUuid),
      },
      OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
    },
  });
}

/**
 * Some emails are deferred until the node is published. This function will handle those deferred emails.
 */
async function handleDeferredEmails(
  uuid: string,
  dpid: string,
  publishStatusId: number,
  context?: HandleDeferredEmailsContext,
) {
  logger.info({ fn: 'handleDeferredEmails', uuid, dpid, publishStatusId }, 'Init deferred emails');

  try {
    const normalizedUuid = ensureUuidEndsWithDot(uuid);

    const deferred = await prisma.deferredEmails.findMany({
      where: {
        nodeUuid: normalizedUuid,
      },
      include: {
        User: true,
      },
    });

    logger.info({ fn: 'handleDeferredEmails', uuid, dpid, deferred }, 'Init deferred emails, step 2');

    const protectedAttestationEmails = deferred.filter((d) => d.emailType === EmailType.PROTECTED_ATTESTATION);

    logger.info({ fn: 'handleDeferredEmails', uuid, dpid, protectedAttestationEmails }, 'Init deferred emails, step 3');

    if (protectedAttestationEmails.length) {
      // `publishedVersionCount` means number of published revisions, not NodeVersion row id.
      let publishedVersionCount = context?.publishedVersionCount;
      let isNodePublished = context?.isNodePublished;
      let publishStateSource: 'context' | 'resolver' | 'db-fallback' = 'context';
      if (publishedVersionCount == null) {
        if (isNodePublished === false) {
          publishedVersionCount = 0;
        } else {
          try {
            // Legacy behavior: use resolver-backed version/publish state first.
            const [nodeVersionCountFromResolver, indexed] = await Promise.all([
              getNodeVersion(normalizedUuid),
              getIndexedResearchObjects([normalizedUuid]),
            ]);
            const resolverIsPublished = indexed?.researchObjects?.length > 0;

            if (nodeVersionCountFromResolver === 0 && !resolverIsPublished) {
              // Resolver can lag behind ceramic/DB writes; fallback to DB to avoid false negatives.
              const dbPublishedVersionCount = await getPublishedVersionCount(normalizedUuid);
              publishedVersionCount = dbPublishedVersionCount;
              if (typeof isNodePublished !== 'boolean') {
                isNodePublished = dbPublishedVersionCount > 0;
              }
              publishStateSource = 'db-fallback';
            } else {
              publishedVersionCount = nodeVersionCountFromResolver;
              if (typeof isNodePublished !== 'boolean') {
                isNodePublished = resolverIsPublished;
              }
              publishStateSource = 'resolver';
            }
          } catch (resolverError) {
            logger.warn(
              { fn: 'handleDeferredEmails', uuid, dpid, resolverError },
              'Resolver publish-state lookup failed, falling back to DB.',
            );
            publishedVersionCount = await getPublishedVersionCount(normalizedUuid);
            if (typeof isNodePublished !== 'boolean') {
              isNodePublished = publishedVersionCount > 0;
            }
            publishStateSource = 'db-fallback';
          }
        }
      }
      if (typeof isNodePublished !== 'boolean') {
        isNodePublished = publishedVersionCount > 0;
      }

      logger.info(
        { fn: 'handleDeferredEmails', uuid, dpid, publishedVersionCount, isNodePublished, context, publishStateSource },
        'Init deferred emails, step 4',
      );

      if (isNodePublished) {
        const latestPublishedVersionIndex = Math.max(publishedVersionCount - 1, 0);
        await Promise.allSettled(
          protectedAttestationEmails.map((entry) => {
            return attestationService.emailProtectedAttestationCommunityMembers(
              entry.attestationId,
              entry.attestationVersionId,
              latestPublishedVersionIndex, // 0-indexed total expected
              dpid,
              entry.User,
              normalizedUuid,
            );
          }),
        );
        logger.info(
          { fn: 'handleDeferredEmails', uuid, dpid, protectedAttestationEmails },
          `Sent ${protectedAttestationEmails.length} deferred protected attestation emails`,
        );
        // Remove the deferred emails after they have been sent
        const executedDeferredEmailIds = protectedAttestationEmails.map((e) => e.id);
        const deleted = await prisma.deferredEmails.deleteMany({
          where: {
            id: { in: executedDeferredEmailIds },
          },
        });
        logger.info(
          { fn: 'handleDeferredEmails', uuid, dpid, protectedAttestationEmails },
          `removed ${deleted?.count} deferred protected attestation email entries as they have been executed`,
        );
      }
    }
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        fireDeferredEmails: true,
      },
    });
  } catch (e) {
    console.error(
      { error: e, fn: 'handleDeferredEmails', uuid, dpid, publishStatusId },
      'Something went wrong whilst firing deferred emails',
    );
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        fireDeferredEmails: false,
      },
    });
  }
}

export interface NodeUpdatedEmailProps {
  nodeOwner: string;
  nodeTitle: string;
  nodeUuid: string;
  nodeDpid: string;
  versionUpdate: string;
}

async function transformDraftComments({
  node,
  owner,
  dpidAlias,
  publishStatusId,
}: {
  node: Node;
  owner: User;
  dpidAlias?: number;
  publishStatusId: number;
}) {
  try {
    const root = await prisma.publicDataReference.findFirst({
      where: { nodeId: node.id, root: true, userId: owner.id },
      orderBy: { updatedAt: 'desc' },
    });
    const result = await getIndexedResearchObjects([node.uuid]);
    // if node is being published for the first time default to 1
    const version = result ? result.researchObjects?.[0]?.versions.length : 1;
    logger.info({ root, result, version, publishStatusId }, 'publishDraftComments::Root');

    // publish draft comments
    await attestationService.publishDraftComments({
      node,
      userId: owner.id,
      dpidAlias: dpidAlias,
      rootCid: root.rootCid,
      version,
    });

    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        transformDraftComments: true,
      },
    });
  } catch (e) {
    logger.error({ node, owner, dpidAlias, publishStatusId, error: e }, 'Failed to transform draft comments');
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        transformDraftComments: false,
      },
    });
  }
}

async function updateAssociatedAttestations(nodeUuid: string, dpid: string, publishStatusId: number) {
  // Moved from controllers/nodes/publish.ts
  logger.info({ nodeUuid, dpid, publishStatusId }, `[updateAssociatedAttestations]`);
  if (!nodeUuid) throw 'No nodeUuid provided';
  try {
    await prisma.nodeAttestation.updateMany({
      where: {
        nodeUuid,
      },
      data: {
        nodeDpid10: dpid,
      },
    });

    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        updateAttestations: true,
      },
    });
  } catch (e) {
    logger.error({ error: e, nodeUuid, publishStatusId }, 'Failed updating associated attestations on publish');
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        updateAttestations: false,
      },
    });
  }

  return;
}

async function createPublishStatusEntry(nodeUuid: string) {
  try {
    const result = await getIndexedResearchObjects([nodeUuid]);

    const version = result?.researchObjects?.length ? result.researchObjects?.[0]?.versions.length : 1;
    logger.info({
      module: 'PublishServices::createPublishStatusEntry',
      result,
      version,
    });

    // Check if already exists
    const existingEntry = await prisma.publishStatus.findFirst({
      where: {
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
        version,
      },
    });

    if (existingEntry) {
      logger.info(
        {
          module: 'PublishServices::createPublishStatusEntry',
          nodeUuid,
          version,
          existingEntryId: existingEntry.id,
        },
        'Publish status entry already exists',
      );
      return existingEntry;
    }

    const newEntry = await prisma.publishStatus.create({
      data: {
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
        version,
      },
    });
    return newEntry;
  } catch (e) {
    logger.error(
      { module: 'PublishServices::createPublishStatusEntry', nodeUuid, e },
      'Error creating publish status entry',
    );
    throw 'Error creating publish status entry';
  }
}

async function updatePublishStatusEntry({
  publishStatusId,
  nodeUuid,
  version,
  data,
}: {
  publishStatusId?: number;
  nodeUuid?: string;
  version?: number;
  data: Prisma.PublishStatusUncheckedUpdateInput;
}) {
  try {
    const identifier = publishStatusId ? { id: publishStatusId } : nodeUuid && version ? { nodeUuid, version } : null;
    if (!identifier) {
      throw 'No identifier provided';
    }
    const result = await prisma.publishStatus.update({
      where: {
        ...identifier,
      },
      data,
    });
    return result;
  } catch (e) {
    logger.error(
      { module: 'PublishServices::updatePublishStatusEntry', nodeUuid, version, e },
      'Error updating publish status entry',
    );
    throw 'Error updating publish status entry';
  }
}

async function getPublishStatusForNode(nodeUuid: string): Promise<PublishStatus[]> {
  try {
    const result = await prisma.publishStatus.findMany({
      where: {
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
      },
    });
    return result;
  } catch (e) {
    logger.error(
      { module: 'PublishServices::getPublishStatusForNode', nodeUuid, e },
      'Error getting publish status entry',
    );
    throw 'Error getting publish status entries for node';
  }
}

async function getPublishStatusEntryById(id: number): Promise<PublishStatus> {
  try {
    const result = await prisma.publishStatus.findUnique({
      where: {
        id,
      },
    });
    return result;
  } catch (e) {
    logger.error({ module: 'PublishServices::getPublishStatusEntryById', id, e }, 'Error getting publish status entry');
    throw 'Error getting publish status entry';
  }
}

async function getPublishStatusEntryByCommitId(commitId: string): Promise<PublishStatus> {
  try {
    const result = await prisma.publishStatus.findUnique({
      where: {
        commitId,
      },
    });
    return result;
  } catch (e) {
    logger.error(
      { module: 'PublishServices::getPublishStatusEntryByCommitId', commitId, e },
      'Error getting publish status entry',
    );
    throw 'Error getting publish status entry';
  }
}

async function updateNodeVersionEntry({
  manifestCid,
  commitId,
  node,
  publishStatusId,
}: {
  manifestCid: string;
  commitId: string;
  node: Node;
  publishStatusId: number;
}) {
  try {
    // Prevent duplicating the NodeVersion entry if the latest version is the same as the one we're trying to publish, as a draft save is triggered before publishing
    const latestNodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        nodeId: node.id,
      },
      orderBy: {
        id: 'desc',
      },
    });

    const latestNodeVersionId = latestNodeVersion?.manifestUrl === manifestCid ? latestNodeVersion.id : -1;

    const nodeVersion = await prisma.nodeVersion.upsert({
      where: {
        id: latestNodeVersionId,
      },
      update: {
        commitId,
      },
      create: {
        nodeId: node.id,
        manifestUrl: manifestCid,
        commitId,
      },
    });

    // Update NodeVersion link in PublishStatus Table, check off nodeVersionHandled
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        versionId: nodeVersion.id,
        commitId: nodeVersion.commitId,
        handleNodeVersionEntry: true,
      },
    });
    return nodeVersion;
  } catch (e) {
    console.error({ error: e, fn: 'updateNodeVersionEntry' }, 'Failed updating NodeVersion entry');
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        handleNodeVersionEntry: false,
      },
    });
    return null;
  }
}

async function checkPrerequisites(publishStatusEntry: PublishStatus, step: PublishStep) {
  const prerequisites = PublishStepPrerequisites[step];
  const unmetPrerequisites = prerequisites.filter((prerequisite) => !publishStatusEntry[prerequisite]);
  return unmetPrerequisites;
}

enum PublishStep {
  CERAMIC_COMMIT = 'ceramicCommit',
  HANDLE_NODE_VERSION_ENTRY = 'handleNodeVersionEntry',
  ASSIGN_DPID = 'assignDpid',
  CREATE_PDR = 'createPdr',
  UPDATE_ATTESTATIONS = 'updateAttestations',
  TRANSFORM_DRAFT_COMMENTS = 'transformDraftComments',
  FIRE_DEFERRED_EMAILS = 'fireDeferredEmails',
  FIRE_NOTIFICATIONS = 'fireNotifications',
}

const PublishStepPrerequisites: Record<PublishStep, PublishStep[]> = {
  [PublishStep.CERAMIC_COMMIT]: [],
  [PublishStep.HANDLE_NODE_VERSION_ENTRY]: [PublishStep.CERAMIC_COMMIT],
  [PublishStep.ASSIGN_DPID]: [PublishStep.CERAMIC_COMMIT],
  [PublishStep.CREATE_PDR]: [PublishStep.CERAMIC_COMMIT, PublishStep.HANDLE_NODE_VERSION_ENTRY],
  [PublishStep.UPDATE_ATTESTATIONS]: [PublishStep.CERAMIC_COMMIT, PublishStep.ASSIGN_DPID],
  [PublishStep.TRANSFORM_DRAFT_COMMENTS]: [PublishStep.CERAMIC_COMMIT, PublishStep.ASSIGN_DPID],
  [PublishStep.FIRE_DEFERRED_EMAILS]: [PublishStep.CERAMIC_COMMIT, PublishStep.ASSIGN_DPID],
  [PublishStep.FIRE_NOTIFICATIONS]: [PublishStep.CERAMIC_COMMIT, PublishStep.ASSIGN_DPID],
};

/**
 * To be used to resume started publishes that abruptly ended or failed at some point.
 * Pass in either: publishStatusId | commitId | nodeUuid & version
 * @param version - Indexed from 1, not 0
 */
export async function publishSequencer({
  publishStatusId,
  commitId,
  nodeUuid,
  version,
}: {
  publishStatusId?: number;
  nodeUuid?: string;
  version?: number;
  commitId?: string;
}) {
  try {
    // Find the publishStatus entry using either publishStatusId | nodeUUid && version | commitId
    let publishStatusEntry: PublishStatus;
    if (publishStatusId) {
      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusId);
    } else if (nodeUuid && version) {
      publishStatusEntry = await prisma.publishStatus.findFirst({
        where: { nodeUuid: ensureUuidEndsWithDot(nodeUuid), version },
      });
    } else if (commitId) {
      publishStatusEntry = await prisma.publishStatus.findFirst({ where: { commitId } });
    } else {
      throw 'No publishStatusId or nodeUuid and version provided';
    }
    if (!publishStatusEntry) {
      throw 'No publish status entry found';
    }

    publishStatusId = publishStatusEntry.id;

    let node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(publishStatusEntry.nodeUuid) } });
    const ceramicStream = node.ceramicStream;
    const { manifest } = await getManifestFromNode(node);
    const legacyDpid = manifest.dpid?.id ? parseInt(manifest.dpid.id) : undefined;
    const owner = await prisma.user.findUnique({ where: { id: node.ownerId } });

    // Execute next steps
    if (!publishStatusEntry.ceramicCommit) {
      // Step 1: Ceramic commit
      // This step is handled by the client, we can't proceed if it's not provided
      throw 'Ceramic commit not found';
    }

    if (!publishStatusEntry.assignDpid) {
      // Step 2: Assign DPID
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.ASSIGN_DPID);
      if (unmetPrereqs.length) throw `Unmet prerequisites for assigning DPID, requires: ${unmetPrereqs.join(', ')}`;

      await createOrUpgradeDpidAlias(legacyDpid, ceramicStream, node.uuid, publishStatusId);
      node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(publishStatusEntry.nodeUuid) } }); // Refetch for later steps

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.assignDpid) throw 'Failed to assign DPID';
    }

    if (!publishStatusEntry.handleNodeVersionEntry) {
      // Step 3: Update NodeVersion entry
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.HANDLE_NODE_VERSION_ENTRY);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for handling NodeVersion entry update, requires: ${unmetPrereqs.join(', ')}`;

      await updateNodeVersionEntry({
        manifestCid: publishStatusEntry.manifestCid,
        commitId: publishStatusEntry.commitId,
        node,
        publishStatusId,
      });

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.handleNodeVersionEntry) throw 'Failed to update NodeVersion entry';
    }

    if (!publishStatusEntry.createPdr) {
      // Step 4: Create public data refs
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.CREATE_PDR);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for creating public data refs, requires: ${unmetPrereqs.join(', ')}`;
      await handlePublicDataRefs({
        nodeId: node.id,
        userId: node.ownerId,
        manifestCid: publishStatusEntry.manifestCid,
        nodeVersionId: publishStatusEntry.versionId,
        nodeUuid: node.uuid,
        publishStatusId,
      });

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.createPdr) throw 'Failed to create public data refs';
    }

    if (!publishStatusEntry.updateAttestations) {
      // Step 5: Update draft attestations
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.UPDATE_ATTESTATIONS);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for updating attestations, requires: ${unmetPrereqs.join(', ')}`;

      await PublishServices.updateAssociatedAttestations(node.uuid, legacyDpid.toString(), publishStatusEntry.id);

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.updateAttestations) throw 'Failed to update draft attestations';
    }

    if (!publishStatusEntry.transformDraftComments) {
      // Step 6: Transform draft comments
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.TRANSFORM_DRAFT_COMMENTS);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for transforming draft comments, requires: ${unmetPrereqs.join(', ')}`;

      await PublishServices.transformDraftComments({
        node,
        owner,
        dpidAlias: node.dpidAlias,
        publishStatusId: publishStatusEntry.id,
      });

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.transformDraftComments) throw 'Failed to transform draft comments';
    }

    if (!publishStatusEntry.fireDeferredEmails) {
      // Step 7: Fire deferred emails
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.FIRE_DEFERRED_EMAILS);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for sending off deferred emails, requires: ${unmetPrereqs.join(', ')}`;

      await PublishServices.handleDeferredEmails(node.uuid, node.dpidAlias.toString(), publishStatusId);

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.fireDeferredEmails) throw 'Failed to send deferred emails';
    }

    if (!publishStatusEntry.fireNotifications) {
      // Step 8: Fire app notifications
      const unmetPrereqs = await checkPrerequisites(publishStatusEntry, PublishStep.FIRE_NOTIFICATIONS);
      if (unmetPrereqs.length)
        throw `Unmet prerequisites for firing notifications, requires: ${unmetPrereqs.join(', ')}`;

      await NotificationService.emitOnPublish(node, owner, node.dpidAlias.toString(), publishStatusId);

      publishStatusEntry = await PublishServices.getPublishStatusEntryById(publishStatusEntry.id);
      if (!publishStatusEntry.fireNotifications) throw 'Failed to fire notifications';
    }

    return true;
  } catch (e) {
    logger.error(
      { fn: 'publishSequencer', error: e, publishStatusId, nodeUuid, version, commitId },
      'Errors in publish',
    );
    return false;
  }
}

export const PublishServices = {
  createPublishStatusEntry,
  updateAssociatedAttestations,
  updatePublishStatusEntry,
  updateNodeVersionEntry,
  getPublishStatusForNode,
  sendVersionUpdateEmailToAllContributors,
  retrieveBlockTimeByManifestCid,
  handleDeferredEmails,
  transformDraftComments,
  getPublishStatusEntryById,
  getPublishStatusEntryByCommitId,
};
