import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
import CID from 'cids';
import { ethers } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { decode, encode } from 'url-safe-base64';

import { prisma } from '../src/client.ts';
import { generateAccessToken } from '../src/controllers/auth/index.ts';
import localChainDpidAbi from '../src/desci-contracts-artifacts/contracts/DpidRegistry.sol/DpidRegistry.json';
import localChainRoAbi from '../src/desci-contracts-artifacts/contracts/ResearchObject.sol/ResearchObject.json';
import localChainDpidInfo from '../src/desci-contracts-config/unknown-dpid.json';
import localChainRoInfo from '../src/desci-contracts-config/unknown-research-object.json';
import repoService from '../src/services/repoService.ts';
import { decodeBase64UrlSafeToHex } from '../src/utils.ts';

export const CHAIN_DEPLOYMENT = {
  address: localChainRoInfo.proxies[localChainRoInfo.proxies.length - 1].address,
  abi: localChainRoAbi.abi,
};

export const DPID_CHAIN_DEPLOYMENT = {
  address: localChainDpidInfo.proxies[localChainDpidInfo.proxies.length - 1].address,
  abi: localChainDpidAbi.abi,
};

export interface BackendPublishParams {
  uuid: string;
}

/**
 * Helper function that can be used to test the backend publishing pipeline or just seeding published data for development testing
 */
export async function backendPublish({ uuid }: BackendPublishParams) {
  const devPrivKey = process.env.DEV_PK;
  const contractAddress = CHAIN_DEPLOYMENT.address;
  if (!devPrivKey) throw new Error('DEV_PK env var not set');
  0;
  const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
  const signer = new ethers.Wallet(devPrivKey, provider);

  const researchObjectContract = new ethers.Contract(contractAddress, CHAIN_DEPLOYMENT.abi, signer);
  const dpidContract = new ethers.Contract(DPID_CHAIN_DEPLOYMENT.address, DPID_CHAIN_DEPLOYMENT.abi, signer);

  // Figure out if we're doing a first publish or a subsequent publish to an already published node
  const base64UuidToBase16 = convertUUIDToHex(uuid);
  const exists = await researchObjectContract.exists(base64UuidToBase16);

  const node = await prisma.node.findFirst({ where: { uuid: uuid }, include: { owner: true } });
  if (!node) throw new Error('Node not found');

  let cid = getBytesFromCIDString(node.manifestUrl);
  let modifiedObject;
  let tx;

  const DEFAULT_DPID_PREFIX_STRING = 'beta';
  const DEFAULT_DPID_PREFIX = formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

  const userToken = generateAccessToken({ email: node.owner.email });

  if (exists) {
    // Subsequent publish preparation
    // Handle prepublish

    // This is to DAGify the draft tree, and update the root data bucket CID in the manifest
    const prepubRes = await prepublish(uuid, userToken);
    if (prepubRes.ok) {
      const { updatedManifestCid, updatedManifest, version } = prepubRes;
      cid = getBytesFromCIDString(updatedManifestCid);

      tx = await researchObjectContract.updateMetadata(base64UuidToBase16, cid);
      await tx.wait();
      modifiedObject.manifest = updatedManifest;
      modifiedObject.cid = updatedManifestCid;
      modifiedObject.nodeVersionId = version?.id;
    } else {
      throw new Error('Prepublish failed');
    }
  } else {
    // First publish preparation

    // Work out the next DPID and set it in the manifest
    const expectedDpidTx = await dpidContract.getOrganization(DEFAULT_DPID_PREFIX);
    const dpidValue = {
      prefix: DEFAULT_DPID_PREFIX_STRING,
      id: expectedDpidTx[0].toString(),
    };
    // This is to set the DPID in the manifest
    // optimistically retrieve new manifest with dpid
    0;
    const amResponse = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions: [{ type: 'Set Dpid', prefix: dpidValue.prefix, id: dpidValue.id }],
    });
    if (!amResponse) throw new Error('Failed to set DPID');

    const prepubRes = await prepublish(uuid, userToken);
    if (prepubRes.ok) {
      const { updatedManifestCid, updatedManifest, version } = prepubRes;
      cid = getBytesFromCIDString(updatedManifestCid);

      const tx = await researchObjectContract.updateMetadata(base64UuidToBase16, cid);
      await tx.wait();
      modifiedObject.manifest = updatedManifest;
      modifiedObject.cid = updatedManifestCid;
      modifiedObject.nodeVersionId = version?.id;
    } else {
      throw new Error('Prepublish failed');
    }
    const regFee = await dpidContract.getFee();
    // Mint the DPID
    tx = await researchObjectContract.mintWithDpid(base64UuidToBase16, cid, DEFAULT_DPID_PREFIX, expectedDpidTx[0], {
      value: regFee,
      gasLimit: 350000,
    });
  }

  // Neutral flow done for both first publish and subsequent publish
  await tx.wait();
  const publish = await publishResearchObject(
    {
      uuid,
      cid: modifiedObject.cid,
      manifest: modifiedObject.manifest!,
      transactionId: tx.hash,
    },
    userToken,
  );
  if (publish.okay) console.log('Successfully Published');
}

function convertUUIDToHex(uuid: string) {
  return decodeBase64UrlSafeToHex(uuid);
}

export const getBytesFromCIDString = (cid: string) => {
  const c = new CID(cid);
  const rootStrHex = c.toString('base16');
  const hexEncoded = '0x' + (rootStrHex.length % 2 === 0 ? rootStrHex : '0' + rootStrHex);
  return hexEncoded;
};

async function prepublish(uuid: string, authToken: string) {
  const options: AxiosRequestConfig = {
    withCredentials: true,
    headers: {
      authorization: `Bearer ${authToken}}`,
    },
  };
  options.headers = { 'Content-Type': 'application/json' };

  const { data } = await axios.post(`http://localhost:${process.env.PORT}/v1/nodes/prepublish`, { uuid }, options);
  return data;
}

async function publishResearchObject(
  input: {
    uuid: string;
    cid: string;
    manifest: ResearchObjectV1;
    transactionId: string;
    ceramicStream?: string;
  },
  authToken: string,
) {
  const options: AxiosRequestConfig = {
    withCredentials: true,
    headers: {
      authorization: `Bearer ${authToken}}`,
    },
  };

  const { data } = await axios.post<{ okay: boolean }>(
    `http://localhost:${process.env.PORT}/v1/nodes/publish`,
    JSON.stringify(input),
    options,
  );
  return data;
}

async function updateDraft(
  payload: { manifest: ResearchObjectV1; uuid: string },
  authToken: string,
): Promise<{ ok: true; hash: string; uri: string }> {
  const options: AxiosRequestConfig = {
    withCredentials: true,
    headers: {
      authorization: `Bearer ${authToken}}`,
    },
  };

  const { data } = await axios.post(
    `http://localhost:${process.env.PORT}/v1/nodes/updateDraft`,
    JSON.stringify(payload),
    options,
  );
  return data;
}
