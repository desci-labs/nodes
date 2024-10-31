import { Node } from '@prisma/client';

import { prisma } from '../client.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getManifestByCid } from './data/processing.js';

export async function getDpidFromNode(node: Node): Promise<number | string | undefined> {
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    try {
      const manifest = await getManifestByCid(manifestCid);
      dpid = manifest?.dpid?.id;
    } catch (e) {
      // let undefined return
    }
  }

  return dpid;
}

export async function getDpidFromNodeUuid(nodeUuid: string): Promise<number | string | undefined> {
  const node = await prisma.node.findUnique({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    select: { dpidAlias: true, manifestUrl: true },
  });
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    try {
      const manifest = await getManifestByCid(manifestCid);
      dpid = manifest?.dpid?.id;
    } catch (e) {
      // let undefined return
    }
  }

  return dpid;
}
