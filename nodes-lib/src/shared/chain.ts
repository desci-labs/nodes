import {
  BigNumber,
  ContractReceipt,
  ContractTransaction,
  Signer,
  providers,
} from "ethers";
import { convertUUIDToHex } from "./util/converting.js";
import { getNodesLibInternalConfig } from "./config/index.js";
import { streams } from "@desci-labs/desci-codex-lib";
import { typechain as tc } from "@desci-labs/desci-contracts";
import { PublishError } from "./errors.js";
import { errWithCause } from "pino-std-serializers";

const LOG_CTX = "[nodes-lib::chain]";

/**
 * Interact with the legacy ResearchObject contract
 * @deprecated legacy registry only
 */
const researchObjectWriter = (signer: Signer) =>
  getNodesLibInternalConfig().legacyChainConfig.researchObjectConnector(signer);

/**
 * Interact with the legacy dPID contract
 * @deprecated legacy registry only
 */
const dpidRegistryWriter = (signer: Signer) =>
  getNodesLibInternalConfig().legacyChainConfig.dpidRegistryConnector(signer);

export const dpidAliasRegistryWriter = (signer: Signer) =>
  getNodesLibInternalConfig().chainConfig.dpidAliasRegistryConnector(signer);

const dpidAliasRegistryReader = (provider: providers.Provider) =>
  getNodesLibInternalConfig().chainConfig.dpidAliasRegistryConnector(provider);

/**
 * Mint a new ID for a stream in the new dPID alias registry.
 *
 * Note that the alias registry is immutable, so there is no
 * risk involved with letting a third party mint a dPID alias
 * for you.
 *
 * Instead of performing this action, you can use the corresponding
 * API method and let the backend mint the ID for you.
 */
export const createDpidAlias = async (
  streamId: streams.StreamID,
  signer: Signer,
): Promise<{ dpid: number; receipt: ContractReceipt }> => {
  let tx: ContractTransaction | undefined;
  let receipt: ContractReceipt | undefined;
  let dpid: number | undefined;
  try {
    tx = await dpidAliasRegistryWriter(signer).mintDpid(streamId.toString());
    receipt = await tx.wait();
    [dpid] = receipt.events!.find((e) => e.event === "DpidMinted")!.args!;
    return { dpid: dpid as number, receipt };
  } catch (e) {
    console.log(`${LOG_CTX} failed to register dPID alias`, {
      tx,
      receipt,
      dpid,
      err: errWithCause(e as Error),
    });
    throw PublishError.aliasRegistration(
      "Failed to register dPID alias",
      e as Error,
    );
  }
};

export const upgradeDpidAlias = async (
  streamId: string,
  dpid: number,
  signer: Signer,
): Promise<ContractReceipt> => {
  try {
    const tx = await dpidAliasRegistryWriter(signer).upgradeDpid(
      BigNumber.from(dpid),
      streamId,
    );
    return await tx.wait();
  } catch (e) {
    console.log(`${LOG_CTX} failed to upgrade dPID`, {
      dpid,
      err: errWithCause(e as Error),
    });
    throw PublishError.dpidUpgrade("Failed to upgrade dPID", e as Error);
  }
};

/**
 * Lookup the history of a legacy dPID in the new alias registry.
 */
export const lookupLegacyDpid = async (
  dpid: number,
): Promise<tc.DpidAliasRegistry.LegacyDpidEntryStruct> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl,
  );
  return await dpidAliasRegistryReader(provider).legacyLookup(dpid);
};

/**
 * Resolve codex streamID for a dPID alias.
 */
export const lookupDpid = async (dpid: number): Promise<string> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl,
  );
  return await dpidAliasRegistryReader(provider).resolve(dpid);
};

/**
 * Find the dPID alias of a given streamID, a reverse lookup.
 */
export const findDpid = async (streamId: string): Promise<number> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl,
  );
  const dpidBn = await dpidAliasRegistryReader(provider).find(streamId);
  return dpidBn.toNumber();
};

/**
 * Check if an UUID has an assigned legacy dPID
 * @deprecated legacy registry only
 */
export const hasDpid = async (uuid: string, signer: Signer): Promise<boolean> =>
  await researchObjectWriter(signer).exists(convertUUIDToHex(uuid));

/**
 * Get the owner address of a legacy dPID
 * @deprecated legacy registry only
 */
export const getTokenOwner = async (
  uuid: string,
  signer: Signer,
): Promise<string> =>
  (
    await researchObjectWriter(signer).ownerOf(convertUUIDToHex(uuid))
  ).toLowerCase();

/**
 * Get the research object token ID for a legacy dPID
 * @deprecated legacy registry only
 */
export const getTokenId = async (
  dpid: number,
  signer: Signer,
): Promise<BigNumber> => await dpidRegistryWriter(signer).get("beta", dpid);
