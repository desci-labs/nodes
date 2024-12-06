import axios from 'axios';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { BlockMetadata, getCidMetadata } from '../../services/ipfs.js';

/**
 * Proxy for obtaining CID metadata
 * Temporarily used until we upgrade kubo on the priv swarm node
 */
export const ipfsReadGatewayProxy = async (
  req: Request<{ cid: string }, any, any, { external?: boolean }>,
  res: Response<BlockMetadata | { error: string }>,
) => {
  const logger = parentLogger.child({
    module: 'PROXY::ipfsMetadataProxyController',
    cid: req.params.cid,
    external: req.query.external,
  });
  logger.trace('Fetching CID metadata');
  try {
    const { cid } = req.params;
    const { external } = req.query;
    const externalFlag = !!external;

    // Forward the request to the IPFS gateway
    const metadata = await getCidMetadata(cid, externalFlag);

    if (metadata) {
      return res.status(200).json(metadata);
    } else {
      return res.status(404).json({ error: 'Metadata not found' });
    }
  } catch (error) {
    logger.info('Error fetching CID metadata:', error);
    return res.status(500).json({ error: 'Error fetching metadata' });
  }
};
