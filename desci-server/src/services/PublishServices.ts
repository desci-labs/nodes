import { DataType, EmailType, Node, NodeContribution, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';

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

export class PublishServices {
  async sendVersionUpdateEmailToAllContributors({
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

    const ownerEmailIncluded = contributors.find((c) => c.email === nodeOwner.email);
    if (!ownerEmailIncluded) {
      // Add the owner to the email list incase they forgot to add themselves as a contributor
      const ownerContributor = { email: nodeOwner.email, name: nodeOwner.name } as unknown as NodeContribution & {
        user: User;
      };
      contributors.push(ownerContributor);
    }

    const emailPromises = contributors.map(async (contributor) => {
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
        privShareCode: shareCode,
      });

      const emailMsg = {
        to: contributor.email,
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
          // if (emailEntry.contributor.id !== undefined) {
          //   prisma.nodeContribution.update({
          //     where: { id: emailEntry.contributor.id },
          //     data: { inviteSent: true },
          //   });
          // }
          return sgMail.send(emailEntry.emailMsg);
        }),
      );
    } else {
      logger.info(
        { nodeEnv: process.env.NODE_ENV },
        'Skipping add contributor email send in non-production environment',
      );
    }

    return true;
  }

  async retrieveBlockTimeByManifestCid(uuid: string, manifestCid: string) {
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
  async handleDeferredEmails(uuid: string, dpid: string) {
    logger.info({ fn: 'handleDeferredEmails', uuid, dpid }, 'Init deferred emails');
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
    }
  }
}
export interface NodeUpdatedEmailProps {
  nodeOwner: string;
  nodeTitle: string;
  nodeUuid: string;
  nodeDpid: string;
  versionUpdate: string;
}

export const publishServices = new PublishServices();
