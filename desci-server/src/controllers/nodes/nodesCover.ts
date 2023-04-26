import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { MEDIA_SERVER_API_KEY, MEDIA_SERVER_API_URL } from 'config';

import { cleanupManifestUrl } from './show';

if (!process.env.NODES_MEDIA_SERVER_URL) {
  throw Error('NODES_MEDIA_SERVER_URL not found, add to env file');
}

const parseVersion = (version: string): number | undefined => {
  if (!version) return undefined;
  return !isNaN(parseInt(version))
    ? +version
    : version[0] === 'v' && version.length === 2
    ? parseInt(version[1]) - 1
    : undefined;
};

export const getCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cid = req.query.cid as string;
    const nodeUUID = req.params.uuid as string;
    const versionQuery = req.params.version as string;
    console.log('versionQuery ', versionQuery, parseVersion(versionQuery));

    if (!nodeUUID) throw Error('Invalid NodeUuid query');
    // check cid exists in data refs table

    const node = await prisma.node.findFirst({ where: { uuid: nodeUUID + '.' } });
    if (!node) throw Error('Node not found');

    const version = parseVersion(versionQuery);
    const publishedNodeVersions = await prisma.nodeVersion.findMany({
      where: { nodeId: node.id, transactionId: { not: null } },
    });

    const defaultVersion = publishedNodeVersions.length > 0 ? publishedNodeVersions.length - 1 : 0;
    console.log('publishedNodeVersions', version, defaultVersion, publishedNodeVersions.length);

    const exists = await prisma.nodeCover.findFirst({
      where: { nodeUuid: nodeUUID + '.', version: version || defaultVersion },
    });

    if (exists) {
      console.log('found cover from cache', cid, nodeUUID, exists.url);
      res.send({ ok: true, url: exists.url, name: exists?.name || node.title });
      return;
    }

    if (!cid) throw Error('Component CID required');

    const dataRefExists = await prisma.dataReference.findFirst({ where: { cid, nodeId: node.id } });
    // console.log('dataRefExists', cid, node.id, nodeUUID);
    if (!dataRefExists) throw Error('Unknown CID reference');

    let url = '';
    const existingCid = await prisma.nodeCover.findFirst({ where: { cid } });
    console.log('existingCid', existingCid);

    if (existingCid) {
      // use cached cid cover url;
      console.log('Use existing url', url, cid);
      url = existingCid.url;
    } else {
      // create cover
      console.log('create cover url', cid);
      const data = await (
        await axios.post(
          `${MEDIA_SERVER_API_URL}/v1/nodes/cover/${cid}`,
          {},
          {
            headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
          },
        )
      ).data;
      url = data.url;
    }

    const nodeVersion = publishedNodeVersions.length
      ? publishedNodeVersions[version] || publishedNodeVersions[publishedNodeVersions.length - 1]
      : undefined;

    let manifest: ResearchObjectV1;
    if (nodeVersion) {
      const gatewayUrl = cleanupManifestUrl(nodeVersion.manifestUrl);
      console.log('gatewayUrl', gatewayUrl, nodeVersion.manifestUrl);
      manifest = (await axios.get(gatewayUrl)).data;
    }

    // const prevCover = await prisma.nodeCover.findFirst

    await prisma.nodeCover.upsert({
      where: { nodeUuid_version: { nodeUuid: nodeUUID + '.', version: version || defaultVersion } },
      create: {
        url: url,
        nodeUuid: nodeUUID + '.',
        cid,
        version: version || defaultVersion,
        name: manifest?.title || node.title,
      },
      update: {
        url: url,
        cid,
        name: manifest?.title || node.title,
      },
    });

    res.send({ ok: true, url: url, title: manifest?.title || node.title });
  } catch (e) {
    console.log('error', e);
    res.status(404).send({ ok: false, message: e.message || 'Error generating cover image' });
  }
};

// export const setCoverImage = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const cid = req.query.cid as string;
//     const nodeUUID = req.params.uuid as string;
//     const versionQuery = req.params.version as string;
//     console.log('versionQuery ', versionQuery, parseVersion(versionQuery));
//     const user = (req as any).user as User;

//     if (!cid || !nodeUUID || !versionQuery) throw Error('Invalid CID params or NodeUuid query');
//     // check cid exists in data refs table

//     const node = await prisma.node.findFirst({ where: { uuid: nodeUUID + '.', ownerId: user.id } });

//     if (!node) throw Error('Node not found');

//     const dataRefExists = await prisma.dataReference.findFirst({ where: { cid, nodeId: node.id } });
//     console.log('dataRefExists', cid, node.id, nodeUUID);
//     if (!dataRefExists) throw Error('Unknown CID reference');

//     const data = await (
//       await axios.post(
//         `${MEDIA_SERVER_API_URL}/v1/nodes/cover/${cid}`,
//         {},
//         {
//           headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
//         },
//       )
//     ).data;

//     // await prisma.nodeCover.upsert({
//     //   where: { nodeUuid: nodeUUID + '.' },
//     //   update: { url: data.url, cid },
//     //   create: { url: data.url, nodeUuid: nodeUUID + '.', cid },
//     // });

//     res.send({ ok: true, url: data.url });
//   } catch (e) {
//     console.log('error', e);
//     res.status(404).send({ ok: false, message: e.message || 'Error generating cover image' });
//   }
// };

// export const resetCoverImage = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const cid = req.query.cid as string;
//     const uuid = req.params.uuid as string;
//     const versionQuery = req.params.version as string;
//     const version = parseVersion(versionQuery);

//     if (!cid || !uuid || !version) throw Error('Invalid CID params or NodeUuid query');
//     // check cid exists in data refs table

//     await prisma.nodeCover.delete({
//       where: { nodeUuid_version: { nodeUuid: uuid + '.', version } },
//     });

//     res.send({ ok: true });
//   } catch (e) {
//     console.log('error', e);
//     res.status(404).send({ ok: false, message: e.message || 'Error generating cover image' });
//   }
// };
