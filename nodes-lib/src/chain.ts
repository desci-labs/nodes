import {
  BigNumber,
  ContractReceipt,
  ContractTransaction,
  Signer,
  providers,
} from "ethers";
import { getNodesLibInternalConfig } from "./config/index.js";
import { streams } from "@desci-labs/desci-codex-lib";
import { typechain as tc } from "@desci-labs/desci-contracts";
import { PublishError } from "./errors.js";
import { errWithCause } from "pino-std-serializers";

const LOG_CTX = "[nodes-lib::chain]";

const dpidAliasRegistryWriter = (signer: Signer) =>
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
  streamId: StreamID,
  signer: Signer
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
      e as Error
    );
  }
};

export const upgradeDpidAlias = async (
  streamId: string,
  dpid: number,
  signer: Signer
): Promise<ContractReceipt> => {
  try {
    const tx = await dpidAliasRegistryWriter(signer).upgradeDpid(
      BigNumber.from(dpid),
      streamId
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
  dpid: number
): Promise<tc.DpidAliasRegistry.LegacyDpidEntryStruct> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl
  );
  return await dpidAliasRegistryReader(provider).legacyLookup(dpid);
};

/**
 * Resolve codex streamID for a dPID alias.
 */
export const lookupDpid = async (dpid: number): Promise<string> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl
  );
  return await dpidAliasRegistryReader(provider).resolve(dpid);
};

/**
 * Find the dPID alias of a given streamID, a reverse lookup.
 */
export const findDpid = async (streamId: string): Promise<number> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl
  );
  const dpidBn = await dpidAliasRegistryReader(provider).find(streamId);
  return dpidBn.toNumber();
};
