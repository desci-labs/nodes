import {
  DpidAliasRegistry,
  type DpidMintedEvent,
} from '@desci-labs/desci-contracts/dist/typechain-types/DpidAliasRegistry.js';
import { ethers } from 'ethers';
import { Response } from 'express';
import { Logger } from 'pino';

import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { getAliasRegistry, getHotWallet, getRegistryOwnerWallet } from '../../services/chain.js';
import { streamLookup } from '../../services/codex.js';
import { setDpidAlias } from '../../services/nodeManager.js';

type DpidResponse = DpidSuccessResponse | DpidErrorResponse;
export type DpidSuccessResponse = {
  dpid: number;
};

export type DpidErrorResponse = {
  error: string;
};

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

  const wallet = await getHotWallet();
  const registry = getAliasRegistry(wallet);

  // Not exists will return the zero value, i.e. 0
  const checkDpid = await registry.find(streamId);
  const existingDpid = ethers.BigNumber.from(checkDpid).toNumber();

  if (existingDpid !== 0) {
    logger.info(`Skipping alias creation, stream ${streamId} already bound to ${existingDpid}`);
    return existingDpid;
  }
  const tx = await registry.mintDpid(streamId);
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

  const ownerWallet = await getRegistryOwnerWallet();
  const dpidAliasRegistry = getAliasRegistry(ownerWallet);
  logger.trace(
    { ownerWallet: ownerWallet.address, registry: await dpidAliasRegistry.resolvedAddress },
    '[upgradeDpid]',
  );
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
  const legacyEntry = await registry.legacyLookup(dpid);
  const [_owner, legacyVersions] = legacyEntry;

  const stream = await streamLookup(ceramicStream);
  const streamVersions = stream.versions;

  // Stream could have one or more additional entries
  if (legacyVersions.length > streamVersions.length) {
    logger.error({ legacyVersions, versions: streamVersions }, 'Stream has shorter history than legacy dPID');
    return false;
  }

  for (const [i, legacyVersion] of legacyVersions.entries()) {
    // Cant compare timestamp because anchor time WILL differ
    const expectedCid = legacyVersion[0];
    if (expectedCid !== streamVersions[i].manifest) {
      logger.error(
        { legacyVersions, versions: streamVersions },
        'Manifest CID mismatch between legacy and stream history',
      );
      return false;
    }
  }

  logger.info({ dpid, ceramicStream }, 'Legacy and stream history check passed');
  return true;
};
