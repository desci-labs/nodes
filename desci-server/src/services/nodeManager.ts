import { DocumentId } from '@automerge/automerge-repo';
import { PdfComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType, Node, Prisma, PublicDataReference, User } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { MEDIA_SERVER_API_KEY, MEDIA_SERVER_API_URL, PUBLIC_IPFS_PATH } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';
import { getFromCache } from '../redisClient.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { ResearchObjectDocument } from '../types/documents.js';
import { getUtcDateXDaysAgo } from '../utils/clock.js';
import { generateDataReferences } from '../utils/dataRefTools.js';
import { cleanupManifestUrl, transformManifestWithHistory } from '../utils/manifest.js';
import { hexToCid, randomUUID64, asyncMap, ensureUuidEndsWithDot } from '../utils.js';

import { addBufferToIpfs, downloadFilesAndMakeManifest, getNodeToUse, getSizeForCid, resolveIpfsData } from './ipfs.js';
import { NodeUuid } from './manifestRepo.js';
import repoService from './repoService.js';

const ESTUARY_MIRROR_ID = 1;

const logger = parentLogger.child({
  module: 'Services::NodeManager',
});

export const createNodeDraftBlank = async (
  owner: User,
  title: string,
  defaultLicense: string,
  researchFields: string[],
) => {
  const { manifest } = await downloadFilesAndMakeManifest({ title, researchFields, defaultLicense, pdf: [], code: [] });
  const { cid: hash } = await addBufferToIpfs(manifest, '', getNodeToUse(owner.isGuest));

  const uri = `${hash}`;

  const node = await prisma.node.create({
    data: {
      title: '',
      uuid: randomUUID64(),
      manifestUrl: uri,
      replicationFactor: 0,
      restBody: {},
      ownerId: owner.id,
    },
  });

  await prisma.nodeVersion.create({
    data: {
      manifestUrl: uri,
      nodeId: node.id,
    },
  });

  const nodeCopy = Object.assign({}, node);
  nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

  return nodeCopy;
};

export const setCeramicStream = async (uuid: string, ceramicStream: string) => {
  logger.debug({ fn: 'setCeramicStream', uuid, ceramicStream }, 'node::setCeramicStream');
  uuid = ensureUuidEndsWithDot(uuid);
  return await prisma.node.update({
    data: {
      ceramicStream,
    },
    where: {
      uuid,
    },
  });
};

export const setDpidAlias = async (uuid: string, dpidAlias: number) => {
  logger.debug({ fn: 'setDpidAlias', uuid, dpidAlias }, 'node::setDpidAlias');
  uuid = ensureUuidEndsWithDot(uuid);
  return await prisma.node.update({
    data: {
      dpidAlias,
    },
    where: {
      uuid,
    },
  });
};

export const createPublicDataRefs = async (
  data: Prisma.PublicDataReferenceCreateManyInput[],
  userId: number | undefined,
  versionId: number | undefined,
) => {
  const dataWithVersions = data.map((d) => ({ ...d, versionId }));
  const publicDataRefRes = await prisma.publicDataReference.createMany({
    data: dataWithVersions,
    skipDuplicates: true,
  });

  logger.debug(
    { fn: 'createPublicDataRefs', userId, versionId },
    `[nodeManager::createPublicDataRefs] public data refs added: ${publicDataRefRes.count}`,
  );
  return publicDataRefRes;
};

/**
 * Create new records for PublicDataReferenceOnIpfsMirror for each data reference
 * @param data
 * @param userId
 */
export const createDataMirrorJobs = async (
  data: Prisma.PublicDataReferenceCreateManyInput[],
  userId: number | undefined,
) => {
  const logger = parentLogger.child({
    module: 'Services::NodeManager',
    fn: 'createDataMirrorJobs',
    dataEntriesLength: data.length,
    userId,
  });
  const activeMirrors = (await prisma.ipfsMirror.findMany()).map((mirror) => mirror.id);
  const mirrorJobs: Prisma.PublicDataReferenceOnIpfsMirrorCreateManyInput[] = [];

  // pull all cid matches from public data refs
  const cidToDataReferenceId = new Map<string, number>();
  const pubRefs = await prisma.publicDataReference.findMany({
    where: {
      cid: {
        in: data.map((d) => d.cid),
      },
    },
  });
  for (const pubRef of pubRefs) {
    cidToDataReferenceId.set(pubRef.cid, pubRef.id);
  }

  for (const dataReference of data) {
    const dataReferenceId = cidToDataReferenceId.get(dataReference.cid);
    // logger.debug(
    //   { dataReferenceId, dataReferenceCid: dataReference.cid },
    //   '[nodeManager::createDataMirrorJobs] stage new public data ref',
    // );
    for (const mirror of activeMirrors) {
      if (!dataReferenceId) {
        logger.warn(
          { dataReferenceId, dataReferenceCid: dataReference.cid, mirror },
          '[nodeManager::createDataMirrorJobs] ERR Skip public data ref',
        );
        continue;
      }
      mirrorJobs.push({
        dataReferenceId,
        mirrorId: mirror,
        status: 'WAITING',
        retryCount: 0,
        providerCount: 0,
      });
    }
  }
  logger.info({ mirrorJobsTotal: mirrorJobs.length }, '[nodeManager::createDataMirrorJobs] ADDING mirrorJobs');
  const mirrorJobsResult = await prisma.publicDataReferenceOnIpfsMirror.createMany({
    data: mirrorJobs,
    skipDuplicates: true,
  });

  logger.info({ mirrorJobsResultCount: mirrorJobsResult.count }, '[nodeManager::createDataMirrorJobs] DONE mirrorJobs');
  return mirrorJobsResult;
};

/**
 * Given a user's manifest, gather all the cids that need to be published
 * Success condition: return array with [manifestCid, databucketRootCid, ...dataCids]
 * @param manifestCid
 * @param userId
 */
export const getAllCidsRequiredForPublish = async (
  manifestCid: string,
  nodeUuid: string | undefined,
  userId: number | undefined,
  nodeId: number | undefined,
  versionId: number | undefined,
): Promise<Prisma.PublicDataReferenceCreateManyInput[]> => {
  // ensure public data refs staged matches our data bucket cids
  const latestManifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  // const manifestString = manifestBuffer.toString('utf8');
  if (!latestManifestEntry) {
    logger.error(
      { fn: 'getAllCidsRequiredForPublish', PUBLIC_IPFS_PATH, manifestCid, userId, nodeId, versionId, nodeUuid },
      `[nodeManager::getAllCidsRequiredForPublish] ERR: Manifest not found for cid=${manifestCid}`,
    );
  } else {
    logger.info(
      {
        fn: 'getAllCidsRequiredForPublish',
        manifestString: latestManifestEntry,
        manifestCid,
        userId,
        nodeId,
        versionId,
        nodeUuid,
      },
      `[nodeManager::getAllCidsRequiredForPublish] cid=${manifestCid}`,
    );
  }

  const manifestEntry: Prisma.PublicDataReferenceCreateManyInput = {
    cid: manifestCid,
    userId,
    root: false,
    directory: false,
    size: await getSizeForCid(manifestCid, false),
    type: DataType.MANIFEST,
    nodeId,
    versionId,
  };
  const dataBucketEntries = await generateDataReferences({ nodeUuid, manifestCid, versionId });
  logger.trace({ dataBucketEntries: dataBucketEntries.length }, '[generateDataReferences]::done');
  return [manifestEntry, ...dataBucketEntries];
};

async function publishCid(job: Prisma.PublicDataReferenceCreateManyInput): Promise<boolean> {
  logger.info({ fn: 'publishCid', jobId: job.id }, `[nodeManager::publishCid] START cid= ${job.cid}`);
  const dataRef = await prisma.publicDataReference.findFirst({
    where: {
      cid: job.cid,
    },
    include: {
      mirrors: {
        where: {
          status: {
            not: 'SUCCESS',
          },
          mirrorId: ESTUARY_MIRROR_ID,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  try {
    // const targetCid = dataRef.cid;
    // const buffer = await resolveIpfsData(targetCid);
    logger.debug({ fn: 'publishCid', job }, `[nodeManager::publishCid] [DATA BUFFER]`);
    // const cid = undefined;
    // const { cid, providers } = await uploadDataToEstuary(targetCid, buffer);
    // // console.log('Target CID uploaded', targetCid, cid);
    await prisma.publicDataReferenceOnIpfsMirror.update({
      data: { status: 'SUCCESS', providerCount: 1 },
      where: {
        dataReferenceId_mirrorId: {
          dataReferenceId: dataRef.id,
          mirrorId: ESTUARY_MIRROR_ID,
        },
      },
    });
    // console.log('targetCid:end', targetCid, cid);

    return true;
  } catch (err) {
    logger.error(
      { fn: 'publishCid', job, err },
      `[nodeManager::publishCid] ERR', cid=${job.cid} errMsg:${err.message}`,
    );
    await prisma.publicDataReferenceOnIpfsMirror.update({
      data: { status: 'PENDING', retryCount: { increment: 1 } },
      where: {
        dataReferenceId_mirrorId: {
          dataReferenceId: dataRef.id,
          mirrorId: ESTUARY_MIRROR_ID,
        },
      },
    });
    return false;
  }
}

export const publishResearchObject = async (publicDataReferences: PublicDataReference[]) => {
  logger.info(
    {
      fn: 'publishResearchObject',
      publicDataReferences,
    },
    `[nodeManager::publishResearchObject] START cid=${publicDataReferences.map((a) => a.cid).join(', ')}`,
  );

  try {
    const published = await asyncMap<boolean, PublicDataReference>(publicDataReferences, publishCid);
    return { published };
  } catch (err) {
    logger.error(
      { fn: 'publishResearchObject', publicDataReferences, err },
      '[nodeManager::publishResearchObject] ERR node-publish-err',
    );
    throw err;
  }
};

export const getCountNewNodesInXDays = async (daysAgo: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewNodesInXDays', daysAgo }, 'node::getCountNewNodesInXDays');
  const now = new Date();

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const newNodesInXDays = await prisma.node.count({
    where: {
      createdAt: {
        gte: utcMidnightXDaysAgo,
      },
    },
  });

  return newNodesInXDays;
};

// get all nodes created in specified month
export const getCountNewNodesInMonth = async (month: number, year: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewNodesInMonth', month, year }, 'node::getCountNewNodesInMonth');
  const sum = await prisma.node.count({
    where: {
      createdAt: {
        gte: new Date(year, month, 1),
        lt: new Date(year, month + 1, 1),
      },
    },
  });
  return sum;
};

export const getBytesInXDays = async (daysAgo: number): Promise<number> => {
  logger.trace({ fn: 'getBytesInXDays', daysAgo }, 'node::getBytesInXDays');
  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const bytesInXDays = await prisma.dataReference.aggregate({
    _sum: { size: true },
    where: {
      createdAt: {
        gte: utcMidnightXDaysAgo,
      },
    },
  });

  return bytesInXDays._sum.size;
};

export const getBytesInMonth = async (month: number, year: number): Promise<number> => {
  logger.trace({ fn: 'getBytesInMonth', month, year }, 'node::getBytesInMonth');
  const sum = await prisma.dataReference.aggregate({
    _sum: { size: true },
    where: {
      createdAt: {
        gte: new Date(year, month, 1),
        lt: new Date(year, month + 1, 1),
      },
    },
  });
  return sum._sum.size || 0;
};

export const cacheNodeMetadata = async (uuid: string, manifestCid: string, versionToCache?: number) => {
  const logger = parentLogger.child({
    module: 'Services:NodeManager',
    fn: 'cacheNodeMetadata',
    uuid,
    manifestCid,
    versionToCache,
  });
  try {
    // pull versions indexes from graph node
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const history = researchObjects[0];
    const version =
      versionToCache !== undefined && versionToCache < history.versions.length
        ? versionToCache
        : history?.versions.length
          ? history.versions.length - 1
          : 0;

    if (!manifestCid || manifestCid.length === 0) {
      history.versions.reverse();
      logger.info({ history, version }, `Node version ${version}`);
      const cidString = history.versions[version]?.cid || history.recentCid;
      manifestCid = hexToCid(cidString); // manifest cid
      logger.debug(`cidString ${cidString}`);
    }

    // pull manifest data from ipfs
    const gatewayUrl = cleanupManifestUrl(manifestCid);
    // console.log('gatewayUrl', gatewayUrl, manifestCid);
    const manifest: ResearchObjectV1 = (await axios.get(gatewayUrl)).data;
    // console.log('cacheNodeMetadata::Manifest', manifest);

    const pdfs = manifest.components.filter(
      // todo: update check to include file extension (.pdf)
      (c) => c.type === ResearchObjectComponentType.PDF && c.starred,
    ) as PdfComponent[];
    logger.debug({ pdfs }, 'PDFS:::=>>>>>>>>>>>>');
    const cid = pdfs[0].payload.url;
    // console.log('Component CID', cid);

    // TODO: handle case where no research-article was published
    if (!cid) {
      logger.info({ cid }, 'No cid to parse');
      return false;
    }

    let url = '';
    const existingCid = await prisma.nodeCover.findFirst({ where: { cid } });
    logger.debug(`existingCid ${existingCid}`);

    if (existingCid) {
      // use cached cid cover url;
      logger.debug({ url, cid }, 'Use existing url');
      url = existingCid.url;
    } else {
      // create cover
      logger.debug(`create cover url ${cid}`);
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

    // upsert node cover
    await prisma.nodeCover.upsert({
      where: { nodeUuid_version: { nodeUuid: uuid, version: version } },
      create: {
        url: url,
        nodeUuid: uuid,
        cid,
        version: version,
        name: manifest.title,
      },
      update: {
        url: url,
        cid,
        name: manifest.title,
      },
    });
    return { version, uuid, manifestCid };
  } catch (error) {
    logger.error({ error }, 'Error cacheNodeMetadata');
    return false;
  }
};

type DocumentInfo = {
  documentId: DocumentId;
  document: ResearchObjectDocument;
};

export const showNodeDraftManifest = async (node: Node, ipfsFallbackUrl?: string) => {
  logger.trace('[getNodeManifest] ==> start');
  const timeDifferenceInSeconds = getTimeDiffInSec(node.createdAt.toString());
  logger.trace(
    { timeDifferenceInSeconds, uuid: node.uuid, now: Date.now(), created: node.createdAt },
    '[getNodeManifest] ==> timeDifferenceInSeconds',
  );

  const cachedDraftMetadata = await getFromCache<DocumentInfo>(`node-draft-${ensureUuidEndsWithDot(node.uuid)}`, 0);

  logger.trace(
    { timeDifferenceInSeconds, uuid: node.uuid, cachedDraftMetadata: !!cachedDraftMetadata },
    '[getNodeManifest] ==> cachedDraftMetadata',
  );

  if (timeDifferenceInSeconds <= 30 && cachedDraftMetadata) {
    logger.trace(
      { timeDifferenceInSeconds, uuid: node.uuid, driveClock: cachedDraftMetadata.document.driveClock },
      '[getNodeManifest] ==> Found cachedDraftetadata',
    );
    return cachedDraftMetadata.document.manifest;
  }

  logger.trace(
    { timeDifferenceInSeconds, uuid: node.uuid, cachedDraftMetadata: !!cachedDraftMetadata },
    '[getNodeManifest] ==> Fallback to repoService.getDraftManifest',
  );
  // Add draft manifest document
  const nodeUuid = ensureUuidEndsWithDot(node.uuid) as NodeUuid;
  // for draft nodes we can do this asynchronously on the frontend
  const manifest = await repoService.getDraftManifest({
    uuid: nodeUuid,
    documentId: node.manifestDocumentId as DocumentId,
  });

  logger.trace({ nodeUuid, manifestFound: !!manifest }, '[getNodeManifest] ==> repoService.getDraftManifest');

  if (manifest) return manifest;

  logger.trace(
    { uuid: node.uuid, cid: node.manifestUrl, ipfsFallbackUrl, timeout: 5000 },
    '[getNodeManifest] ==> Fallback to IPFS Call',
  );
  const gatewayUrl = cleanupManifestUrl(node.manifestUrl, ipfsFallbackUrl);
  const data = transformManifestWithHistory((await axios.get(gatewayUrl, { timeout: 5000 })).data, node);

  logger.trace(
    { uuid: node.uuid, cid: node.manifestUrl, ipfsFallbackUrl, manifest: !!data },
    '[getNodeManifest] ==> Found manifest on IPFS',
  );

  logger.trace('[getNodeManifest] ==> end');
  return data;
};

const getTimeDiffInSec = (date: string) => {
  const now = Date.now();
  const start = new Date(date).getTime();

  return (now - start) / 1000;
};

/**
 * Minimal Data query methods with range arguments
 */

export const getNewNodesInRange = async ({ from, to }: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getNewNodesInXDays', from, to }, 'node::getNewNodesInXDays');

  return await prisma.node.findMany({
    where: {
      createdAt: {
        gte: from,
        lt: to,
      },
    },
    select: { createdAt: true },
  });
};

export const getBytesInRange = async ({ from, to }: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getBytesInRange', from, to }, 'node::getBytesInRange');

  return await prisma.dataReference.findMany({
    // _sum: { size: true },
    where: {
      createdAt: {
        gte: from,
        lt: to,
      },
    },
    select: { size: true, createdAt: true },
  });

  // return bytesInXDays._sum.size;
};
