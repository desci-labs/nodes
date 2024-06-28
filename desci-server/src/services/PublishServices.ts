import { Node, NodeContribution, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { prisma } from '../client.js';
import { getNodeVersion, hexToCid } from '../internal.js';
import { logger as parentLogger } from '../logger.js';
import { NodeUpdatedEmailHtml } from '../templates/emails/utils/emailRenderer.js';
import { getIndexedResearchObjects } from '../theGraph.js';

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
    const contributors = ownerOnly ? [] : await contributorService.retrieveAllContributionsForNode(node, verifiedOnly);
    const nodeOwner = await prisma.user.findUnique({ where: { id: node.ownerId } });
    const manifest = await getLatestManifestFromNode(node);
    const dpid = manifest.dpid?.id;
    const versionPublished = await getNodeVersion(node.uuid);

    if (!dpid) {
      logger.error(
        { nodeUuid: node.uuid, 'manifest.dpid': manifest?.dpid, nodeOwner, totalContributors: contributors.length },
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

    const emailPromises = contributors.map((contributor) => {
      const emailHtml = NodeUpdatedEmailHtml({
        nodeOwner: nodeOwner.name,
        nodeUuid: node.uuid,
        nodeTitle: node.title,
        nodeDpid: dpid,
        versionUpdate: versionPublished,
        manuscriptCid: manuscriptCid,
      });

      const emailMsg = {
        to: contributor.email,
        from: 'no-reply@desci.com',
        subject: `[nodes.desci.com] DPID ${dpid || '(DEMO)'} has been updated`,
        text: `${nodeOwner.name} has published an updated version (${versionPublished}) of their research object titled "${node.title}" that you have contributed to.`,
        html: emailHtml,
      };

      return { contributor, emailMsg };
    });

    if (process.env.SHOULD_SEND_EMAIL && process.env.SENDGRID_API_KEY) {
      await Promise.allSettled(
        emailPromises.map((emailEntry) => {
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
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    if (!researchObjects.length)
      logger.warn({ fn: 'retrieveBlockTimeByManifestCid' }, `No research objects found for nodeUuid ${uuid}`);
    const indexedNode = researchObjects[0];
    const targetVersion = indexedNode.versions.find((v) => hexToCid(v.cid) === manifestCid);
    if (!targetVersion) {
      logger.warn(
        { fn: 'retrieveBlockTimeByManifestCid', uuid, manifestCid },
        `No version match was found for nodeUuid/manifestCid`,
      );
      return '-1';
    }
    return targetVersion.time;
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
