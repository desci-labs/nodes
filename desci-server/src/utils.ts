import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { randomBytes } from 'crypto';

import { base16 } from 'multiformats/bases/base16';
import { CID } from 'multiformats/cid';
import { encode, decode } from 'url-safe-base64';

export const encodeBase64UrlSafe = (bytes: Buffer) => {
  return encode(Buffer.from(bytes).toString('base64'));
};

export const decodeBase64UrlSafeToHex = (base64safe: string) => {
  const h = Buffer.from(decode(base64safe), 'base64').toString('hex');
  return h.length % 2 == 0 ? h : h.substring(1);
};

export const randomUUID64 = () => {
  const bytes = randomBytes(32);

  const encoded = encodeBase64UrlSafe(bytes);
  console.log('GOT BYTES', Buffer.from(bytes).toString('hex'), encoded);
  return encoded;
};

export const hexToCid = (hexCid: string) => {
  hexCid = hexCid.substring(2); // remove 0x
  hexCid = hexCid.length % 2 === 0 ? hexCid.substring(1) : hexCid;
  // const cidBytes = Buffer.from(hexCid, 'hex');

  const res2 = base16.decode(hexCid);
  const cid = CID.decode(res2);
  const cidString = cid.toString();

  return cidString;
};

export async function asyncMap<T, E>(arr: E[], predicate: (input: E) => Promise<T>): Promise<T[]> {
  const results = await Promise.all(arr.map(predicate));

  return results as T[];
}


export function extractManifestCids(manifest: ResearchObjectV1) {
  const cids = []
  manifest.components.forEach((c) => {
    if (c.type !== ResearchObjectComponentType.DATA && c.payload?.url) cids.push(c.payload.url)
    if (c.type === ResearchObjectComponentType.DATA && c.payload?.cid) cids.push(c.payload.cid)
  })
  return cids
}