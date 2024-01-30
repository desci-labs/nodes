import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { getIndexedResearchObjects } from '../../theGraph.js';
import { encodeBase64UrlSafe } from '../../utils.js';

//takes a hex uuid or array of hex uuids, returns a mapped array of hexuuids, titles
export const retrieveTitle = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid } = req.body;
  const uuidList = Array.isArray(uuid) ? uuid : [uuid];

  //ensure correct body format received
  if (!uuidList.every((i) => typeof i === 'string'))
    return res
      .status(400)
      .send({ ok: false, error: 'Invalid request, provide a CID string or an array of CID strings' });

  //convert hex uuids to b64 uids (db format for lookup)
  const hexB64Map = {};
  uuidList.forEach((u) => {
    const hex = Buffer.from(u.substring(2), 'hex');
    const b64 = encodeBase64UrlSafe(hex);
    hexB64Map[u] = b64;
  });

  try {
    const nodes = await prisma.node.findMany({
      select: {
        uuid: true,
        title: true,
      },
      where: {
        uuid: { in: Object.values(hexB64Map) },
      },
    });

    //confirms the ROs are published
    const uuids = nodes.map((n) => n.uuid);
    const indexed = await getIndexedResearchObjects(uuids);
    if (!indexed.researchObjects.length)
      return res.status(404).send({ ok: false, message: 'No published research objects found' });
    const indexedUuids = indexed.researchObjects.map((ro) => ro.id);

    const titles = indexedUuids.map((hexUuid) => {
      const node = nodes.find((node) => node.uuid === hexB64Map[hexUuid]);
      return { uuid: hexUuid, title: node.title };
    });
    return res.status(200).send({ titles });
  } catch (e) {
    logger.error({ err: e }, 'error');
    return res.status(404).send({ ok: false, message: 'Not Found' });
  }
};
