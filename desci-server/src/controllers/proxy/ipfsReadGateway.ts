import axios from 'axios';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';

/**
 * Proxy for the read only IPFS gateway, to allow the isolated media server to access IPFS content, without writability.
 */
export const ipfsReadGatewayProxy = async (req: Request, res: Response) => {
  debugger;
  try {
    const logger = parentLogger.child({
      module: 'PROXY::ipfsReadGatewayProxyController',
      cid: req.params.cid,
    });
    const { cid } = req.params;
    if (!process.env.IPFS_READ_ONLY_GATEWAY_SERVER) {
      logger.error('IPFS_READ_ONLY_GATEWAY_SERVER is not defined in environment variables');
      return res.status(500).send('Unable to connect to IPFS gateway');
    }
    const url = `${process.env.IPFS_READ_ONLY_GATEWAY_SERVER}/${cid}`;

    // Forward the request to the IPFS gateway
    const response = await axios.get(url, { responseType: 'stream' });

    // Forward headers
    res.set('Content-Type', response.headers['content-type']);

    // Stream the response back to the client
    response.data.pipe(res);
  } catch (error) {
    console.error('Error forwarding IPFS request:', error);
    return res.status(500).send('Error forwarding IPFS request');
  }
  return res.status(200);
};
