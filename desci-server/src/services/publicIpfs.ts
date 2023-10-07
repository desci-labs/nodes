import { create } from 'ipfs-http-client';
import type { AddResult } from 'ipfs-http-client/types/src/add-all';

import parentLogger from 'logger';

const logger = parentLogger.child({ module: 'Services::publicIpfs' });
export const ipfsPublishNodeClient = create({ url: process.env.IPFS_PUBLISH_NODE_URL });

export const uploadDataToPublicIpfs = async (cid: string, body: Buffer): Promise<AddResult | null> => {
  logger.trace({ fn: 'uploadDataToPublicIpfs', cid }, '[publicIpfs::uploadDataToPublicIpfs]');

  try {
    const res = await ipfsPublishNodeClient.add(body, { pin: true });

    logger.info({ fn: 'uploadDataToPublicIpfs', cid }, '[publicIpfs::uploadDataToPublicIpfs] response', cid);
    return res;
  } catch (err) {
    logger.error(
      { cid, err, errResponse: err.response?.data },
      '[publicIpfs::uploadDataToPublicIpfs] publicIpfs error',
    );
    return null;
  }
};
