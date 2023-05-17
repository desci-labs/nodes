import {
  CodeComponent,
  DataComponent,
  DataComponentPayload,
  PdfComponent,
  PdfComponentPayload,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import {
  DataReference,
  DataType,
  Prisma,
  PublicDataReference,
  PublicDataReferenceOnIpfsMirror,
  User,
} from '@prisma/client';
import axios from 'axios';
import * as Throttle from 'promise-parallel-throttle';

import prisma from 'client';
import { MEDIA_SERVER_API_KEY, MEDIA_SERVER_API_URL, PUBLIC_IPFS_PATH } from 'config';
import { cleanupManifestUrl } from 'controllers/nodes';
import { uploadDataToEstuary } from 'services/estuary';
import { getIndexedResearchObjects } from 'theGraph';
import { hexToCid, randomUUID64 } from 'utils';
import { asyncMap } from 'utils';
import { generateExternalCidMap, recursiveFlattenTree } from 'utils/driveUtils';
import { cleanManifestForSaving } from 'utils/manifestDraftUtils';

import {
  RecursiveLsResult,
  addBufferToIpfs,
  client,
  downloadFilesAndMakeManifest,
  getDirectoryTree,
  getDirectoryTreeCids,
  getSizeForCid,
  resolveIpfsData,
} from './ipfs';
import { isDir } from './ipfs';
import { generateDataReferences } from 'utils/dataRefTools';

const ESTUARY_MIRROR_ID = 1;

export const createNodeDraftBlank = async (
  owner: User,
  title: string,
  defaultLicense: string,
  researchFields: string[],
) => {
  const { manifest } = await downloadFilesAndMakeManifest({ title, researchFields, defaultLicense, pdf: [], code: [] });
  const { cid: hash } = await addBufferToIpfs(manifest, '');

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

export const createPublicDataRefs = async (
  data: Prisma.PublicDataReferenceCreateManyInput[],
  userId: number | undefined,
  versionId: number | undefined,
) => {
  let dataWithVersions = data.map((d) => ({ ...d, versionId }));
  const publicDataRefRes = await prisma.publicDataReference.createMany({
    data: dataWithVersions,
    skipDuplicates: true,
  });
  console.log('[nodeManager::createPublicDataRefs] publicDataRefRes=', publicDataRefRes);
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
    console.log('[nodeManager::createDataMirrorJobs] stage new public data ref', dataReferenceId, dataReference.cid);
    for (const mirror of activeMirrors) {
      if (!dataReferenceId) {
        console.log('[nodeManager::createDataMirrorJobs] ERR Skip public data ref', dataReferenceId, dataReference.cid);
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
  console.log('[nodeManager::createDataMirrorJobs] ADDING mirrorJobs', mirrorJobs);
  const mirrorJobsResult = await prisma.publicDataReferenceOnIpfsMirror.createMany({
    data: mirrorJobs,
    skipDuplicates: true,
  });

  console.log('[nodeManager::createDataMirrorJobs] DONE mirrorJobs', mirrorJobsResult);
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
    console.error(`[nodeManager::getAllCidsRequiredForPublish] ERR: Manifest not found for cid=${manifestCid}`);
  } else {
    console.log(`[nodeManager::getAllCidsRequiredForPublish] manifestString=${latestManifestEntry} cid=${manifestCid}`);
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
  const dataBucketEntries = await generateDataReferences(nodeUuid, manifestCid, versionId);

  return [manifestEntry, ...dataBucketEntries];
};

async function publishCid(job: Prisma.PublicDataReferenceCreateManyInput): Promise<boolean> {
  console.log('[nodeManager::publishCid] START cid=', job.cid);
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
    const targetCid = dataRef.cid;
    const buffer = await resolveIpfsData(targetCid);
    console.log('[nodeManager::publishCid] [DATA BUFFER]::', buffer);
    const { cid, providers } = await uploadDataToEstuary(targetCid, buffer);
    // console.log('Target CID uploaded', targetCid, cid);
    await prisma.publicDataReferenceOnIpfsMirror.update({
      data: { status: 'SUCCESS', providerCount: providers.length },
      where: {
        dataReferenceId_mirrorId: {
          dataReferenceId: dataRef.id,
          mirrorId: ESTUARY_MIRROR_ID,
        },
      },
    });
    // console.log('targetCid:end', targetCid, cid);

    return cid && cid.length > 0;
  } catch (err) {
    console.error('[nodeManager::publishCid] ERR', `cid=${job.cid}`, err.message, err);
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
  console.log(`[nodeManager::publishResearchObject] START cid=${publicDataReferences.map((a) => a.cid).join(', ')}`);

  try {
    const published = await asyncMap<boolean, PublicDataReference>(publicDataReferences, publishCid);
    return { published };
  } catch (err) {
    console.error('[nodeManager::publishResearchObject] ERR node-publish-err', err);
    throw err;
  }
};

export const getCountNewNodesInXDays = async (daysAgo: number): Promise<number> => {
  console.log('node::getCountNewNodesInXDays');
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const newNodesInXDays = await prisma.node.count({
    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
    },
  });

  return newNodesInXDays;
};

// get all nodes created in specified month
export const getCountNewNodesInMonth = async (month: number, year: number): Promise<number> => {
  console.log('node::getCountNewNodesInMonth');
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
  console.log('node::getBytesInXDays');
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const bytesInXDays = await prisma.dataReference.aggregate({
    _sum: { size: true },
    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
    },
  });

  return bytesInXDays._sum.size;
};

export const getBytesInMonth = async (month: number, year: number): Promise<number> => {
  console.log('node::getBytesInMonth');
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
      console.log('Node version', history, version);
      const cidString = history.versions[version]?.cid || history.recentCid;
      manifestCid = hexToCid(cidString); // manifest cid
      console.log('cidString', cidString);
    }

    // pull manifest data from ipfs
    const gatewayUrl = cleanupManifestUrl(manifestCid);
    // console.log('gatewayUrl', gatewayUrl, manifestCid);
    const manifest: ResearchObjectV1 = (await axios.get(gatewayUrl)).data;
    // console.log('cacheNodeMetadata::Manifest', manifest);

    const pdfs = manifest.components.filter(
      (c) => c.type === ResearchObjectComponentType.PDF && c.starred,
    ) as PdfComponent[];
    console.log('PDFS:::=>>>>>>>>>>>>', JSON.stringify(pdfs));
    const cid = pdfs[0].payload.url;
    // console.log('Component CID', cid);

    // TODO: handle case where no research-article was published
    if (!cid) {
      console.log('No cid to parse', cid);
      return false;
    }

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
  } catch (e) {
    console.log('Error cacheNodeMetadata', e);
    return false;
  }
};
