import { newCeramicClient, resolveHistory } from '@desci-labs/desci-codex-lib';
import { contracts, typechain as tc } from '@desci-labs/desci-contracts';
import {
  DpidAliasRegistry,
  type DpidMintedEvent,
} from '@desci-labs/desci-contracts/dist/typechain-types/DpidAliasRegistry.js';
import { ethers } from 'ethers';
import { Response } from 'express';
import { Logger } from 'pino';

import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { setDpidAlias } from '../../services/nodeManager.js';

type DpidResponse = DpidSuccessResponse | DpidErrorResponse;
export type DpidSuccessResponse = {
  dpid: number;
};

export type DpidErrorResponse = {
  error: string;
};

const CERAMIC_API_URLS = {
  local: 'http://host.docker.internal:7007',
  dev: 'https://ceramic-dev.desci.com',
  prod: 'https://ceramic-prod.desci.com',
} as const;

const OPTIMISM_RPC_URLS = {
  local: 'http://host.docker.internal:8545',
  dev: 'https://reverse-proxy-dev.desci.com/rpc_opt_sepolia',
  prod: 'https://reverse-proxy-prod.desci.com/rpc_opt_mainnet',
} as const;

/** Not secret: pre-seeded ganache account for local dev */
const GANACHE_PKEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const apiServerUrl = process.env.SERVER_URL;

/** Manually set in this module since the envvar needs to support OG ethereum during migration */
let optimismRpcUrl: string;
let aliasRegistryAddress: string;
let ceramicApiUrl: string;

if (apiServerUrl.includes('localhost') || apiServerUrl.includes('host.docker.internal')) {
  aliasRegistryAddress = contracts.localDpidAliasInfo.proxies.at(0).address;
  ceramicApiUrl = CERAMIC_API_URLS.local;
  optimismRpcUrl = OPTIMISM_RPC_URLS.local;
} else if (apiServerUrl.includes('dev') || apiServerUrl.includes('staging')) {
  aliasRegistryAddress = contracts.devDpidAliasInfo.proxies.at(0).address;
  ceramicApiUrl = CERAMIC_API_URLS.dev;
  optimismRpcUrl = OPTIMISM_RPC_URLS.dev;
} else if (process.env.NODE_ENV === 'production') {
  aliasRegistryAddress = contracts.prodDpidAliasInfo.proxies.at(0).address;
  ceramicApiUrl = CERAMIC_API_URLS.prod;
  optimismRpcUrl = OPTIMISM_RPC_URLS.prod;
} else {
  console.error('Cannot derive contract address due to ambiguous environment');
  throw new Error('Ambiguous environment');
}

console.log('Using new publish configuration:', { aliasRegistryAddress, optimismRpcUrl, ceramicApiUrl });

export const createDpid = async (req: RequestWithNode, res: Response<DpidResponse>) => {
  const owner = req.user;
  const node = req.node;
  const { uuid } = req.body;

  const logger = parentLogger.child({
    module: 'NODE::createDpidController',
    body: req.body,
    uuid,
    user: owner,
    ceramicStream: node.ceramicStream,
  });

  if (!uuid) {
    return res.status(400).json({ error: 'UUID is required' });
  }

  if (!process.env.HOT_WALLET_KEY) {
    logger.error('hot wallet not configured');
    return res.status(500).json({ error: 'registration not available: no hot wallet configured' });
  }

  try {
    const dpid = await getOrCreateDpid(node.ceramicStream);
    if (!node.dpidAlias) {
      setDpidAlias(uuid, dpid);
    }
    return res.status(200).send({ dpid });
  } catch (err) {
    logger.error({ err }, 'node-create-dpid-err');
    return res.status(400).send({ error: err.message });
  }
};

export const getOrCreateDpid = async (streamId: string): Promise<number> => {
  const logger = parentLogger.child({
    module: 'NODE::mintDpid',
    ceramicStream: streamId,
  });

  const provider = new ethers.providers.JsonRpcProvider(optimismRpcUrl);

  await provider.ready;
  const wallet = new ethers.Wallet(
    apiServerUrl.includes('localhost') ? GANACHE_PKEY : process.env.HOT_WALLET_KEY,
    provider,
  );

  const dpidAliasRegistry = tc.DpidAliasRegistry__factory.connect(aliasRegistryAddress, wallet);

  // Not exists will return the zero value, i.e. 0
  const checkDpid = await dpidAliasRegistry.find(streamId);
  const existingDpid = ethers.BigNumber.from(checkDpid).toNumber();

  if (existingDpid !== 0) {
    logger.info(`Skipping alias creation, stream ${streamId} already bound to ${existingDpid}`);
    return existingDpid;
  }

  const tx = await dpidAliasRegistry.mintDpid(streamId);
  const receipt = await tx.wait();
  const {
    args: [dpidBn],
  } = receipt.events[0] as DpidMintedEvent;
  const dpid = ethers.BigNumber.from(dpidBn).toNumber();

  logger.info(`Created dPID alias ${dpid} for stream ${streamId}`);

  return dpid;
};

/**
 * Related, but not directly API exposed, functionality to upgrade a legacy
 * dPID. Neither this function nor the contract can do any validation that
 * this stream represents the history of that dPID, so this needs to be
 * verified before this function is called.
 *
 * Note: this method in the registry contract is only callable by contract
 * owner, so this is not generally available.
 */
export const upgradeDpid = async (dpid: number, ceramicStream: string): Promise<number> => {
  const logger = parentLogger.child({
    module: 'NODE::upgradeDpid',
    ceramicStream,
    dpid,
  });

  const provider = new ethers.providers.JsonRpcProvider(optimismRpcUrl);

  if (!process.env.REGISTRY_OWNER_PKEY) {
    throw new Error('REGISTRY_OWNER_PKEY missing, cannot upgrade dpid');
  }

  await provider.ready;
  const wallet = new ethers.Wallet(
    apiServerUrl.includes('localhost') ? GANACHE_PKEY : process.env.REGISTRY_OWNER_PKEY,
    provider,
  );

  const dpidAliasRegistry = tc.DpidAliasRegistry__factory.connect(aliasRegistryAddress, wallet);

  const historyValid = await validateHistory(dpid, ceramicStream, dpidAliasRegistry, logger);
  if (!historyValid) {
    logger.warn({ dpid, ceramicStream }, 'version histories disagree; refusing to upgrade dPID');
    throw new Error('dPID history mismatch');
  }

  const tx = await dpidAliasRegistry.upgradeDpid(dpid, ceramicStream);
  await tx.wait();

  logger.info(`Upgraded dPID ${dpid} to track stream ${ceramicStream}`);

  return dpid;
};

/**
 * Makes sure the passed stream history matches the sequence of
 * CID's as they were imported into the alias registry contract.
 * This should be checked before upgrading a dPID, to make sure
 * the new stream accurately represents the publish history.
 */
const validateHistory = async (dpid: number, ceramicStream: string, registry: DpidAliasRegistry, logger: Logger) => {
  const client = newCeramicClient(ceramicApiUrl);
  const legacyEntry = await registry.legacyLookup(dpid);

  const streamEvents = await resolveHistory(client, ceramicStream);
  const streamStates = await Promise.all(
    streamEvents.map((s) => s.commit).map((c) => client.loadStream(c).then((state) => state.content)),
  );

  const [_owner, legacyVersions] = legacyEntry;

  // Stream could have one or more additional entries
  if (legacyVersions.length > streamStates.length) {
    logger.error({ legacyVersions, streamStates }, 'Stream has shorter history than legacy dPID');
    return false;
  }

  for (const [i, legacyVersion] of legacyVersions.entries()) {
    // Cant compare timestamp because anchor time WILL differ
    const expectedCid = legacyVersion[0];
    if (expectedCid !== streamStates[i].manifest) {
      logger.error({ legacyVersions, streamStates }, 'Manifest CID mismatch between legacy and stream history');
      return false;
    }
  }

  logger.info({ dpid, ceramicStream }, 'Legacy and stream history check passed');
  return true;
};
