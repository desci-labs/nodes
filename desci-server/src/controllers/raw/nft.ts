import { BigNumber } from 'ethers';
import { NextFunction, Request, Response } from 'express';

import { encodeBase64UrlSafe } from 'utils';

/**
 * Get NFT metadata
 * @param req
 * @param res
 * @param next
 */
export const nft = async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const hex = BigNumber.from(id)._hex;
  const num = Buffer.from(hex.substring(2), 'hex');
  const base64safe = encodeBase64UrlSafe(num);
  res.send({
    description:
      'DeSci Nodes allow you to easily make your manuscript available as a reproducible document, annotate your work for the public, connect research outputs such as code and data to your manuscript, and secure all of it into a permanent and tamper-proof Research Object.',
    external_url: `https://nodes.desci.com/${base64safe}`,
    image: 'https://ipfs.io/ipfs/QmaQC86NYUtukf8MGK1QToNUKp2fwJHuwrRJ6YEYR7jL5z',
    name: 'DeSci Node',
    background_color: '#111111',
    animation_url: 'https://ipfs.io/ipfs/QmaQC86NYUtukf8MGK1QToNUKp2fwJHuwrRJ6YEYR7jL5z',
    attributes: [],
  });
};
