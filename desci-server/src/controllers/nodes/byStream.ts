import { Request, Response } from 'express';
import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';

const logger = parentLogger.child({
  module: 'NODE::nodeByStreamController',
});

type NodeByStreamParams = {
  stream: string;
};

type NodeByStreamSuccess = {
  uuid: string;
  dpidAlias: number;
  ceramicStream: string;
};

type NodeByStreamError = {
  stream: string;
  error: string;
  details: string;
  cause: any;
};

type NodeByStreamResponse =
  | NodeByStreamSuccess
  | NodeByStreamError;

/**
 * Lookup a node by it's streamID. If the node was published though Nodes,
 * this should be set in the Nodes table. A failure doesn't mean the stream
 * can't resolve, just that we haven't seen it.
*/
export const nodeByStream = async (
  req: Request<NodeByStreamParams>,
  res: Response<NodeByStreamResponse>
): Promise<typeof res> => {
  const stream = req.params.stream;

  let node: NodeByStreamSuccess;
  try {
    node = await prisma.node.findFirstOrThrow({
      select: {
        uuid: true,
        dpidAlias: true,
        ceramicStream: true,
      },
      where: {
        ceramicStream: {
          equals: stream,
        }
      },
    });
  } catch (e) {
    let errPayload: NodeByStreamError;
    if (e instanceof PrismaClientKnownRequestError) {
      const errPayload = {
        stream,
        error: e.code,
        details: e.message,
        cause: e.meta,
      };

      if (e?.code === "P2025") {
        logger.warn(errPayload, "no node matching stream");
        return res.status(404).send(errPayload);
      };
    } else {
      const err = e as Error;
      errPayload = {
        stream,
        error: err.name,
        details: err.message,
        cause: err.cause,
      };
    };

    logger.error(errPayload, "unexpected error");
    return res.status(500).send(errPayload);
  };

  logger.info({ stream, node }, "found matching node for stream");
  return res.status(200).send(node);
};
