import { ResearchObject, ResearchObjectV1 } from '@desci-labs/desci-models';
import fetch from 'node-fetch';

import { prisma } from '../client.js';
import { encodeBase64UrlSafe } from '../utils.js';

interface DpidDataEntry {
  dpid: string;
  id: string;
  recentCid: string;
  researchObject: DpidResearchObject;
}

interface DpidResearchObject {
  id: string;
  versions: DpidVersion[];
}

interface DpidVersion {
  id: string;
  time: number;
  cid: string;
  index: number;
}

// Example of how to type an array of these data entries
type DataEntries = DpidDataEntry[];

export const endorseDpid = async (dpid: string) => {
  //   const node = await prisma.node.findFirst({
  //     where: {
  //       uuid: dpid,
  //     },
  //   });
  //   if (node) {
  const dpidResolver = `https://beta.dpid.org/api/v1/dpid?page=${parseInt(dpid) + 1}&size=1&sort=asc`;
  console.log({ dpidResolver });
  const dpidResponse = await fetch(dpidResolver);
  const dpidJson = await dpidResponse.json();
  const dpidData: DpidDataEntry = dpidJson[0];
  console.log({ dpidData });

  let nodeUuid: string = dpidData.researchObject.id;
  // convert hex string to integer
  const nodeUuidInt = Buffer.from(nodeUuid.substring(2), 'hex');
  // convert integer to hex
  nodeUuid = nodeUuidInt.toString('base64url');

  const nodeUuidHex = dpidData.researchObject.id;
  // convert to url-safe-base64
  //   nodeUuid = encodeBase64UrlSafe(Buffer.from(nodeUuid, 'hex'));

  console.log({
    ogId: dpidData.researchObject.id.substring(2),
    nodeUuid,
    nodeUuidHex,
    // nodeUuidInt,
  });

  const manifestCid = dpidData.recentCid;
  const data = await fetch(`https://ipfs.desci.com/ipfs/${manifestCid}`);
  const manifest = (await data.json()) as ResearchObjectV1;
  const title = manifest.title || 'Untitled Node';
  const abstract = manifest.description || 'No description provided';
  const date = new Date(dpidData.researchObject.versions[dpidData.researchObject.versions.length - 1].time * 1000);
  const authors = manifest.authors.map((author) => author.name).join(', ');

  const user = await prisma.user.upsert({
    where: {
      email: 'sina@desci.com',
    },
    create: {
      email: 'sina@desci.com',
    },
    update: {},
  });
  const userId = user.id;

  const desciCommunityId = await prisma.desciCommunity.upsert({
    create: {
      name: 'DeSci Labs',
      description: 'DeSci Labs Community',
    },
    update: {},
    where: {
      name: 'DeSci Labs',
    },
  });

  const feedItem = await prisma.nodeFeedItem.upsert({
    where: {
      nodeDpid10: dpid,
    },
    create: {
      nodeDpid10: dpid,
      nodeUuid,
      nodeUuidHex,
      manifestCid,
      title,
      date,
      authors,
      abstract,
      nodeFeedItemEndorsement: {
        create: {
          nodeDpid10: dpid,
          userId,
          desciCommunityId: desciCommunityId.id,
          type: 'validation',
        },
      },
    },
    update: { title, date, authors, abstract },
  });

  console.log('feedItem', { feedItem });
  //   }
};

// use first argument as dpid
endorseDpid(process.argv[2]);
