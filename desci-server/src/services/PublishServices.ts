import { Node } from '@prisma/client';
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
  async sendVersionUpdateEmailToAllContributors({ node }: { node: Node }) {
    const contributors = await contributorService.retrieveAllVerifiedContributionsForNode(node);
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

    const emailPromises = contributors.map((contributor) => {
      const emailHtml = NodeUpdatedEmailHtml({
        nodeOwner: nodeOwner.name,
        nodeUuid: node.uuid,
        nodeTitle: node.title,
        nodeDpid: dpid,
        versionUpdate: versionPublished,
      });

      const emailMsg = {
        to: contributor.email,
        from: 'no-reply@desci.com',
        subject: `[nodes.desci.com] DPID ${dpid} has been updated`,
        text: `${nodeOwner.name} has published an updated version (${versionPublished}) of their research object titled "${node.title}" that you have contributed to.`,
        html: emailHtml,
      };

      return emailMsg;
    });

    if (process.env.NODE_ENV === 'production') {
      await Promise.allSettled(emailPromises.map((emailMsg) => sgMail.send(emailMsg)));
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
