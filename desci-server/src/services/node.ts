import { Node } from '@prisma/client';

import { prisma } from '../client.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getManifestByCid, getManifestFromNode } from './data/processing.js';

export async function getDpidForNode(node: Node): Promise<number | string | undefined> {
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    const manifest = await getManifestByCid(manifestCid);
    dpid = manifest?.dpid?.id;
  }

  return dpid;
}

export async function getDpidFromNodeUuid(nodeUuid: string): Promise<number | string | undefined> {
  const node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(nodeUuid) } });
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    const manifest = await getManifestByCid(manifestCid);
    dpid = manifest?.dpid?.id;
  }

  return dpid;
}
