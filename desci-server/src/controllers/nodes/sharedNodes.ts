import { IpldUrl, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { getLatestManifestFromNode } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { PRIV_SHARE_CONTRIBUTION_PREFIX } from '../../services/Contributors.js';
import { getManifestFromNode } from '../../services/data/processing.js';
import { getIndexedResearchObjects } from '../../theGraph.js';

export type SharedNode = {
  uuid: string;
  manifestCid: string;
  title?: string;
  versions: number;
  coverImageCid?: string | IpldUrl;
  published?: boolean;
  dpid?: ResearchObjectV1Dpid;
  publishDate?: string;
  pendingVerification: boolean;
  pendingContributionId?: string;
  shareKey: string;
};

export type ListSharedNodesRequest = Request<never, never> & {
  user: User; // added by auth middleware
};

export type ListSharedNodesResBody =
  | {
      ok: boolean;
      sharedNodes: SharedNode[];
    }
  | {
      error: string;
    };

export const listSharedNodes = async (req: ListSharedNodesRequest, res: Response<ListSharedNodesResBody>) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for ListSharedNodes controller, requires req.user');

  const logger = parentLogger.child({
    module: 'PrivateShare::ListSharedNodesController',
    body: req.body,
    userId: user.id,
  });

  if (!user.email) {
    logger.warn({}, 'User does not have an email, no nodes can be shared with the user.');
    return res.status(500).json({ error: 'User does not have an email' });
  }

  try {
    logger.trace({}, 'Retrieving shared nodes for user');
    const privSharedNodes = await prisma.privateShare.findMany({
      where: {
        memo: `${PRIV_SHARE_CONTRIBUTION_PREFIX}${user.email}`,
      },
      include: {
        node: true,
      },
    });

    logger.trace({ privSharedNodesLength: privSharedNodes.length }, 'Shared nodes retrieved successfully');

    if (privSharedNodes?.length === 0) {
      return res.status(200).json({ ok: true, sharedNodes: [] });
    }

    const nodeUuids = privSharedNodes.map((priv) => priv.node.uuid);
    const { researchObjects } = await getIndexedResearchObjects(nodeUuids);

    logger.trace({ researchObjectsLength: researchObjects.length }, 'Research objects retrieved successfully');

    const publishedNodesMap = researchObjects.reduce((acc, ro) => {
      try {
        // convert hex string to integer
        const nodeUuidInt = Buffer.from(ro.id.substring(2), 'hex');
        // convert integer to hex
        const nodeUuid = nodeUuidInt.toString('base64url');
        acc[nodeUuid] = ro;
      } catch (e) {
        logger.error({ acc, ro, e, message: e?.message }, 'Failed to convert hex string to integer');
      }
      return acc;
    }, {});

    logger.trace(
      { publishedNodesMapKeyLength: Object.keys(publishedNodesMap).length },
      'Published nodes map created successfully',
    );

    // Work out if any action on the shared node is required (e.g. verifying the contribution)
    const contributionEntries = await prisma.nodeContribution.findMany({
      where: {
        deleted: false,
        OR: [{ userId: user.id }, { email: user.email }, { orcid: user.orcid }],
        userId: user.id,
        node: {
          uuid: {
            in: nodeUuids,
          },
        },
      },
      include: { node: true },
    });

    const contributionEntryMap = contributionEntries.reduce((acc, entry) => {
      acc[entry.node.uuid] = entry;
      return acc;
    }, {});

    const filledSharedNodes = await Promise.all(
      privSharedNodes.map(async (priv) => {
        const { node } = priv;
        const latestManifest = await getLatestManifestFromNode(node);
        const publishedEntry = publishedNodesMap[node.uuid];
        const contributionEntry = contributionEntryMap[node.uuid];
        const pendingVerification = contributionEntry?.verified === false && contributionEntry?.denied === false;

        return {
          uuid: node.uuid,
          manifestCid: node.manifestUrl,
          title: latestManifest.title,
          versions: publishedEntry?.versions.length,
          coverImageCid: latestManifest.coverImage,
          dpid: latestManifest.dpid,
          publishDate: publishedEntry?.versions[0].time,
          published: !!publishedEntry,
          pendingVerification: !!pendingVerification,
          ...(!!pendingVerification && { pendingContributionId: contributionEntry.contributorId }),
          shareKey: priv.shareId,
        };
      }),
    );
    logger.trace({ filledSharedNodesLength: filledSharedNodes.length }, 'Shared nodes filled successfully');

    if (filledSharedNodes) {
      logger.info({ totalSharedNodesFound: filledSharedNodes.length }, 'Shared nodes retrieved successfully');
      return res.status(200).json({ ok: true, sharedNodes: filledSharedNodes });
    }
  } catch (e) {
    logger.error({ e, message: e?.message }, 'Failed to retrieve shared nodes for user');
    return res.status(500).json({ error: 'Failed to retrieve shared nodes' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
