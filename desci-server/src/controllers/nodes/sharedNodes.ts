import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { getLatestManifestFromNode } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { PRIV_SHARE_CONTRIBUTION_PREFIX } from '../../services/Contributors.js';

export type SharedNode = {
  uuid: string;
  title: string;
  published: boolean;
  dpid?: number;
  shareKey: string;
  pendingVerification: boolean;
  pendingContributionId?: string;
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
      select: {
        shareId: true,
        node: {
          select: {
            uuid: true,
            manifestUrl: true,
            dpidAlias: true,
            manifestDocumentId: true,
            // Get published versions, if any
            versions: {
              where: {
                OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
              },
            },
          },
        },
      },
    });

    logger.trace({ privSharedNodesLength: privSharedNodes.length }, 'Shared nodes retrieved successfully');

    if (privSharedNodes?.length === 0) {
      return res.status(200).json({ ok: true, sharedNodes: [] });
    }

    const nodeUuids = privSharedNodes.map((priv) => priv.node.uuid);

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
      select: {
        verified: true,
        denied: true,
        contributorId: true,
        node: { select: { uuid: true } },
      },
    });

    const contributionEntryMap = contributionEntries.reduce(
      (acc, entry) => {
        acc[entry.node.uuid] = entry;
        return acc;
      },
      {} as Record<string, (typeof contributionEntries)[number]>,
    );

    const filledSharedNodes = await Promise.all(
      privSharedNodes.map(async ({ shareId, node }) => {
        const latestManifest = await getLatestManifestFromNode(node);
        const manifestDpid = latestManifest.dpid ? parseInt(latestManifest.dpid.id) : undefined;
        const published = node.versions.length > 0;

        const contributionEntry = contributionEntryMap[node.uuid];
        const pendingVerification = contributionEntry?.verified === false && contributionEntry?.denied === false;

        return {
          uuid: node.uuid,
          published,
          title: latestManifest.title,
          dpid: node.dpidAlias ?? manifestDpid,
          pendingVerification: !!pendingVerification,
          ...(!!pendingVerification && { pendingContributionId: contributionEntry.contributorId }),
          shareKey: shareId,
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
