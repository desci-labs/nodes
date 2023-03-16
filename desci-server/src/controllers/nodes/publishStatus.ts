import { Request, Response } from 'express';
import { cleanupManifestUrl } from './show';
import axios from 'axios';
import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { extractManifestCids } from 'utils';
import prisma from 'client';

//Takes in a manifest cid, returns a list of priv cids, anything not inside the map should be assumed as public
export const retrievePublishStatus = async (req: Request, res: Response) => {
  console.log('[PUBLISH STATUS]Params: ', req.params);
  const { manifestCid, nodeUuid } = req.params;
  if (!manifestCid || !nodeUuid) return res.status(400).send({ error: 'No CID or node UUID provided' });
  //   const owner = (req as any).user;

  try {
    const manifestUrl = cleanupManifestUrl(manifestCid as string, req.query?.g as string);
    const manifest = await (await axios.get(manifestUrl)).data;
    if (!manifest) return res.status(404).send({ error: 'Failed to retrieve manifest' });

    const cids = extractManifestCids(manifest);

    const privRefs = await prisma.dataReference.findMany({
      where: {
        node: { uuid: nodeUuid + '.' },
        cid: { in: cids },
      },
    });

    const privCids = privRefs.map((e) => e.cid);

    const pubRefs = await prisma.publicDataReference.findMany({
      where: {
        node: { uuid: nodeUuid + '.' },
        cid: { in: privCids },
      },
    });

    const pubCids = pubRefs.map((e) => e.cid);

    //cross references priv references with pub references, removing those that include a public entry
    const actualPrivCids = privCids.filter((c) => !pubCids.includes(c));

    return res.status(200).send({ privCids: actualPrivCids });
  } catch (e) {
    console.log(`[PUBLISH STATUS]Failed to retrieve private cid list, err: `, e);
    return res.status(400);
  }
};
