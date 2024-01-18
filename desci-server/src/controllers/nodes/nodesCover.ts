import { PdfComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { MEDIA_SERVER_API_KEY, MEDIA_SERVER_API_URL } from '../../config/index.js';
import { logger as parentLogger } from '../../logger.js';
import { cacheNodeMetadata } from '../../services/nodeManager.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';

if (!process.env.NODES_MEDIA_SERVER_URL) {
  throw Error('NODES_MEDIA_SERVER_URL not found, add to env file');
}

const parseVersion = (version: string): number | undefined => {
  if (!version) return undefined;
  return !isNaN(parseInt(version))
    ? +version
    : version[0]?.toLowerCase() === 'v' && version.length > 1
      ? parseInt(version.substring(1)) - 1
      : undefined;
};

export const getCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  const nodeUUID = req.params.uuid as string;
  const versionQuery = req.params.version as string;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::getCoverImageController',
    body: req.body,
    uuid: nodeUUID,
    versionQuery,
    user: (req as any).user,
  });
  // const cid = req.query.cid as string;
  try {
    let version = parseVersion(versionQuery);
    logger.info({ version: version }, 'version');

    if (!nodeUUID) throw Error('Invalid Node uuid');
    const uuid = nodeUUID + '.';

    const node = await prisma.node.findFirst({ where: { uuid: nodeUUID + '.' } });
    if (!node) throw Error('Node not found');

    logger.trace({ version }, `Version: ${version}`);

    if (version !== undefined) {
      // check if uuid + version is already cached
      logger.info(`version query exists ${version}`);
      const meta = await prisma.nodeCover.findFirst({ where: { nodeUuid: uuid, version } });
      if (meta) {
        logger.info({ meta }, 'Return cached metadata');
        res.status(200).send({ ok: true, url: meta.url, title: meta.name || node.title });
        return;
      }
    }

    const cached = await cacheNodeMetadata(uuid, '', version);
    logger.info({ cached }, 'cached from history');
    if (cached) {
      const meta = await prisma.nodeCover.findFirst({ where: { nodeUuid: uuid, version: cached.version } });
      if (meta) {
        res.status(200).send({ ok: true, url: meta.url, title: meta.name || node.title });
        return;
      }
    } else {
      // res.status(400).send({ ok: false, url: '', title: node.title });
      // return;
    }

    logger.info({ node }, 'node uuid found');
    const draftNodeVersions = await prisma.nodeVersion.findMany({
      where: { nodeId: node.id, transactionId: { not: null } },
    });

    const defaultVersion = draftNodeVersions.length > 0 ? draftNodeVersions.length - 1 : 0;
    logger.info({ version, defaultVersion, draftNodeVersionsFound: draftNodeVersions.length }, 'draftNodeVersions');
    logger.info({ draftNodeVersions }, 'draft versions ====================>');
    version = version ?? defaultVersion;
    const exists = await prisma.nodeCover.findFirst({
      where: { nodeUuid: uuid, version: version },
    });

    if (exists) {
      logger.info({ existsUrl: exists.url }, 'found cover from cache');
      res.send({ ok: true, url: exists.url, name: exists?.name || node.title });
      return;
    }

    const nodeVersion = draftNodeVersions.length
      ? draftNodeVersions[version] || draftNodeVersions[draftNodeVersions.length - 1]
      : undefined;

    if (!nodeVersion) throw Error('Node cannot be resolved');

    const gatewayUrl = cleanupManifestUrl(nodeVersion.manifestUrl);
    logger.debug({ gatewayUrl, manifestUrl: nodeVersion.manifestUrl }, 'gatewayUrl');
    const manifest: ResearchObjectV1 = (await axios.get(gatewayUrl)).data;
    /**
     * Note only starred pdfs are eligible for cover art
     */
    const pdfs = manifest.components.filter(
      (c) => c.type === ResearchObjectComponentType.PDF && c.starred,
    ) as PdfComponent[];
    logger.info({ pdfs }, 'PDFS:::=>>>>>>>>>>>>');
    const cid = pdfs[0].payload.url;

    if (!cid) {
      // TODO: return default url
      res.send({ ok: true, url: '', name: manifest.title || node.title });
      return;
    }

    const dataRefExists = await prisma.dataReference.findFirst({ where: { cid, nodeId: node.id } });
    // console.log('dataRefExists', cid, node.id, nodeUUID);
    if (!dataRefExists) throw Error('Unknown CID reference');

    let url = '';
    const existingCid = await prisma.nodeCover.findFirst({ where: { cid } });
    logger.debug({ existingCid }, 'existingCid');

    if (existingCid) {
      // use cached cid cover url;
      logger.debug({ url, cid }, 'Use existing url');
      url = existingCid.url;
    } else {
      // create cover
      logger.info({ cid }, 'create cover url');
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

    // const prevCover = await prisma.nodeCover.findFirst

    await prisma.nodeCover.upsert({
      where: { nodeUuid_version: { nodeUuid: uuid, version } },
      create: {
        url: url,
        nodeUuid: uuid,
        cid,
        version: version,
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
    logger.error({ error: e }, 'error');
    res.status(404).send({ ok: false, message: e.message || 'Error generating cover image' });
  }
};
