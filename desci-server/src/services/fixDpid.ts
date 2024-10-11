// write a script to fix a dpid passed as an arg
import { DataType, Prisma } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { encodeBase64UrlSafe } from '../utils.js';

import { getSizeForCid } from './ipfs.js';

const logger = parentLogger.child({ module: 'FIX DPID' });

export const convertHexToUUID = (hex: string): string => {
  const num = Buffer.from(hex.substring(2), 'hex');
  const base64safe = encodeBase64UrlSafe(num);
  return base64safe;
};

export const getTargetDpidUrl = () => {
  // check target dpid API url
  const TARGET_DPID_URL_BY_SERVER_URL = {
    'https://nodes-api-dev.desci.com': 'https://dev-beta.dpid.org',
    'https://nodes-api.desci.com': 'https://beta.dpid.org',
    'http://localhost:5420': 'http://host.docker.internal:5460',
  };
  const targetDpidUrl = TARGET_DPID_URL_BY_SERVER_URL[process.env.SERVER_URL];
  return targetDpidUrl as string;
};

// usage: npx tsx scripts/fix-dpid.ts 211
// where 211 is the dpid to fix

const fixDpid = async (dpid: string) => {
  logger.info({ fixDpid: dpid });
  if (!dpid) {
    logger.error('Missing dpid');
    process.exit(1);
  }
  // lookup dpid in https://beta.dpid.org/api/v1/dpid?page=${parseInt(dpid) + 1}&sort=asc&size=1

  const targetDpidUrl = getTargetDpidUrl();

  const data = await fetch(`${targetDpidUrl}/api/v1/dpid?page=${parseInt(dpid) + 1}&sort=asc&size=1`);
  const json = (await data.json())[0];
  logger.info(json);
  const recentCid = json.recentCid;

  const researchObjectId = json.researchObject.id;

  const uuidFromHex = convertHexToUUID(researchObjectId);

  logger.info({ uuidFromHex });

  // get nodeId
  const node = await prisma.node.findFirst({
    where: {
      uuid: uuidFromHex,
    },
  });

  // get latest NodeVersion
  const nodeVersion = await prisma.publicDataReference.findFirst({
    where: {
      nodeId: node.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  const nodeVersionId = nodeVersion.versionId;

  const manifestRef = await prisma.publicDataReference.findMany({
    where: {
      nodeId: node.id,
      versionId: nodeVersionId,
      cid: recentCid,
      type: DataType.MANIFEST,
    },
  });

  if (!manifestRef.length) {
    logger.error('No manifest reference found, adding');
    const manifestEntry: Prisma.PublicDataReferenceCreateManyInput = {
      cid: recentCid,
      userId: node.ownerId,
      root: false,
      directory: false,
      size: await getSizeForCid(recentCid, false),
      type: DataType.MANIFEST,
      nodeId: node.id,
      versionId: nodeVersionId,
    };
    logger.info({ manifestEntry });
    await prisma.publicDataReference.create({
      data: manifestEntry,
    });
    logger.info('Manifest reference added');
    process.exit(0);
  } else {
    logger.info('Manifest reference found');
    process.exit(0);
  }

  // ensure recentCid is in the PublicDataReference table for this node
};
export { fixDpid };
