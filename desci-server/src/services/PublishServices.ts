import { DataType, EmailType, Node, NodeContribution, Prisma, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { update } from 'lodash';

import { prisma } from '../client.js';
import { getNodeVersion } from '../controllers/communities/util.js';
import { logger as parentLogger } from '../logger.js';
import { SubmissionPackageEmailHtml } from '../templates/emails/utils/emailRenderer.js';
import { getIndexedResearchObjects, getTimeForTxOrCommits } from '../theGraph.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { attestationService } from './Attestation.js';
import { contributorService } from './Contributors.js';
import { getLatestManifestFromNode } from './manifestRepo.js';

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
    : await contributorService.retrieveAllContributionsForNode({ node, verifiedOnly, withEmailOnly: true });
  const nodeOwner = await prisma.user.findUnique({ where: { id: node.ownerId } });
  const manifest = await getLatestManifestFromNode(node);
  const dpid = node.dpidAlias?.toString() ?? manifest.dpid?.id;
  const versionPublished = await getNodeVersion(node.uuid);

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
      subject: `[nodes.desci.com] Your submission package is ready`,
      text: `${nodeOwner.name} has published their research object titled "${node.title}" that you have contributed to.`,
      html: emailHtml,
    };
    return { contributor, emailMsg };
  });

  if (process.env.SHOULD_SEND_EMAIL && process.env.SENDGRID_API_KEY) {
    await Promise.allSettled(
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

/**
 * Some emails are deferred until the node is published. This function will handle those deferred emails.
 */
async function handleDeferredEmails(uuid: string, dpid: string, publishStatusId: number) {
  logger.info({ fn: 'handleDeferredEmails', uuid, dpid, publishStatusId }, 'Init deferred emails');

  try {
    const deferred = await prisma.deferredEmails.findMany({
      where: {
        nodeUuid: ensureUuidEndsWithDot(uuid),
      },
      include: {
        User: true,
      },
    });

    logger.info({ fn: 'handleDeferredEmails', uuid, dpid, deferred }, 'Init deferred emails, step 2');

    const protectedAttestationEmails = deferred.filter((d) => d.emailType === EmailType.PROTECTED_ATTESTATION);

    logger.info({ fn: 'handleDeferredEmails', uuid, dpid, protectedAttestationEmails }, 'Init deferred emails, step 3');

    if (protectedAttestationEmails.length) {
      // Handle the emails related to protected attestation claims
      const nodeVersion = await getNodeVersion(uuid);

      const indexed = await getIndexedResearchObjects([uuid]);
      const isNodePublished = indexed?.researchObjects?.length > 0;

      logger.info({ fn: 'handleDeferredEmails', uuid, dpid, indexed, isNodePublished }, 'Init deferred emails, step 4');

      if (isNodePublished) {
        await Promise.allSettled(
          protectedAttestationEmails.map((entry) => {
            return attestationService.emailProtectedAttestationCommunityMembers(
              entry.attestationId,
              entry.attestationVersionId,
              nodeVersion - 1, // 0-indexed total expected
              dpid,
              entry.User,
              ensureUuidEndsWithDot(uuid),
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
      await PublishServices.updatePublishStatusEntry({
        publishStatusId,
        data: {
          fireDeferredEmails: true,
        },
      });
    }
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
  // Moved from controllers/nodes/publish.ts

  try {
    const root = await prisma.publicDataReference.findFirst({
      where: { nodeId: node.id, root: true, userId: owner.id },
      orderBy: { updatedAt: 'desc' },
    });
    const result = await getIndexedResearchObjects([ensureUuidEndsWithDot(node.uuid)]);
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
  // debugger; //////
  try {
    const result = await getIndexedResearchObjects([ensureUuidEndsWithDot(nodeUuid)]);

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
  data: Prisma.PublishStatusUpdateInput;
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

async function getPublishStatusForNode(nodeUuid: string) {
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
    throw 'Error getting publish status entry';
  }
}

export const PublishServices = {
  createPublishStatusEntry,
  updateAssociatedAttestations,
  updatePublishStatusEntry,
  getPublishStatusForNode,
  sendVersionUpdateEmailToAllContributors,
  retrieveBlockTimeByManifestCid,
  handleDeferredEmails,
  transformDraftComments,
};
