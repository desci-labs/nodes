import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { NoveltyScoreConfig } from '../../services/node.js';

const logger = parentLogger.child({
  module: 'NODE::nodeByDpidController',
});

type NodeByDpidParams = {
  /** Matched as integer in route */
  dpid: string;
};

type NodeByDpidSuccess = {
  uuid: string;
  dpidAlias: number;
  ceramicStream: string;
  noveltyScoreConfig?: NoveltyScoreConfig | Prisma.JsonValue;
};

type NodeByDpidError = {
  dpid: number;
  error: string;
  details: string;
  cause: any;
};

type NodeByDpidResponse = NodeByDpidSuccess | NodeByDpidError;

/**
 * Lookup a node by it's dpid *alias*. If the node was published though Nodes,
 * this should be set in the Nodes table. A failure doesn't mean the dPID
 * can't resolve, just that we haven't seen it.
 */
export const nodeByDpid = async (
  req: Request<NodeByDpidParams>,
  res: Response<NodeByDpidResponse>,
): Promise<typeof res> => {
  const dpid = parseInt(req.params.dpid);

  let node: NodeByDpidSuccess;
  try {
    node = await prisma.node.findFirstOrThrow({
      select: {
        uuid: true,
        dpidAlias: true,
        ceramicStream: true,
        noveltyScoreConfig: true,
      },
      where: {
        OR: [{ dpidAlias: { equals: dpid } }, { legacyDpid: { equals: dpid } }],
      },
    });
  } catch (e) {
    let errPayload: NodeByDpidError;
    if (e instanceof PrismaClientKnownRequestError) {
      const errPayload = {
        dpid,
        error: e.code,
        details: e.message,
        cause: e.meta,
      };

      if (e?.code === 'P2025') {
        logger.warn(errPayload, 'no node matching dPID');
        return res.status(404).send(errPayload);
      }
    } else {
      const err = e as Error;
      errPayload = {
        dpid,
        error: err.name,
        details: err.message,
        cause: err.cause,
      };
    }

    logger.error(errPayload, 'unexpected error');
    return res.status(500).send(errPayload);
  }

  logger.info({ dpid, node }, 'found matching node for dpid');
  return res.status(200).send(node);
};
