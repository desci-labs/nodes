import { Response } from "express";
import { ethers } from "ethers";
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from "../../middleware/authorisation.js";
import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { DpidMintedEvent, UpgradedDpidEvent } from "@desci-labs/desci-contracts/dist/typechain-types/DpidAliasRegistry.js";
import { setDpidAlias } from "../../services/nodeManager.js";

type DpidResponse = DpidSuccessResponse | DpidErrorResponse;
export type DpidSuccessResponse = {
  dpid: number;
};

export type DpidErrorResponse = {
  error: string;
};

/** Not secret: pre-seeded ganache account for local dev */
const GANACHE_PKEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let aliasRegistryAddress: string;
const url = process.env.SERVER_URL;

if (url.includes("localhost")) {
  aliasRegistryAddress = contracts.localDpidAliasInfo.proxies.at(0).address;
} else if (url.includes("dev") || url.includes("staging")) {
  aliasRegistryAddress = contracts.devDpidAliasInfo.proxies.at(0).address;
} else if (process.env.NODE_ENV === "production") {
  aliasRegistryAddress = contracts.prodDpidAliasInfo.proxies.at(0).address;
};

export const createDpid = async (req: RequestWithNode, res: Response<DpidResponse>) => {
  const owner = req.user;
  const node = req.node;
  const { uuid } = req.body;

  const logger = parentLogger.child({
    module: "NODE::createDpidController",
    body: req.body,
    uuid,
    user: owner,
    ceramicStream: node.ceramicStream,
  });

  if (!uuid) {
    return res.status(400).json({ error: "UUID is required" });
  };

  if (!process.env.HOT_WALLET_KEY) {
    logger.error("hot wallet not configured");
    return res.status(500).json({ error: "dpid registration not available" });
  };

  if (!process.env.ETHEREUM_RPC_URL) {
    logger.error("ethereum RPC endpoint not configured");
    return res.status(500).json({ error: "dpid registration not available" });
  };

  try {
    const dpid = await getOrCreateDpid(node.ceramicStream);
    if (!node.dpidAlias) {
      setDpidAlias(uuid, dpid);
    };
    return res.status(200).send({ dpid });
  } catch (err) {
    logger.error({ err }, "node-create-dpid-err");
    return res.status(400).send({ error: err.message });
  };
};

export const getOrCreateDpid = async (
  streamId: string,
): Promise<number> => {
  const logger = parentLogger.child({
    module: "NODE::mintDpid",
    ceramicStream: streamId,
  });

  const provider = new ethers.providers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL
  );

  await provider.ready;
  const wallet = new ethers.Wallet(
    url.includes("localhost") ? GANACHE_PKEY : process.env.HOT_WALLET_KEY,
    provider,
  );

  const dpidAliasRegistry = tc.DpidAliasRegistry__factory.connect(
    aliasRegistryAddress,
    wallet,
  );

  const checkDpid = await dpidAliasRegistry.find(streamId);
  const existingDpid = ethers.BigNumber.from(checkDpid).toNumber();

  if (existingDpid !== 0) {
    logger.info(`Skipping alias creation, stream ${streamId} already bound to ${existingDpid}`);
    return existingDpid;
  };

  const tx = await dpidAliasRegistry.mintDpid(streamId);
  const receipt = await tx.wait();
  const { args: [ dpidBn ] } = receipt.events[0] as DpidMintedEvent;
  const dpid = ethers.BigNumber.from(dpidBn).toNumber();

  logger.info(
    `Created dPID alias ${dpid} for stream ${streamId}`,
  );

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
export const upgradeDpid = async (
  dpid: number,
  ceramicStream: string,
): Promise<number> => {
  const logger = parentLogger.child({
    module: "NODE::upgradeDpid",
    ceramicStream,
  });

  const provider = new ethers.providers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL
  );

  if (!process.env.REGISTRY_OWNER_PKEY) {
    throw new Error("REGISTRY_OWNER_PKEY missing, cannot upgrade dpid");
  };

  await provider.ready;
  const wallet = new ethers.Wallet(
    url.includes("localhost") ? GANACHE_PKEY : process.env.REGISTRY_OWNER_PKEY,
    provider,
  );

  const dpidAliasRegistry = tc.DpidAliasRegistry__factory.connect(
    aliasRegistryAddress,
    wallet,
  );

  const tx = await dpidAliasRegistry.upgradeDpid(dpid, ceramicStream);
  await tx.wait();

  logger.info(
    `Upgraded dPID ${dpid} to track stream ${ceramicStream}`,
  );

  return dpid;
};
