import { BigNumber, ContractReceipt, Signer, ethers, providers, utils } from "ethers";
import { convertUUIDToHex, convertCidTo0xHex} from "./util/converting.js";
import { changeManifest, prePublishDraftNode, type PrepublishResponse } from "./api.js"
import { getNodesLibInternalConfig } from "./config/index.js";
import { DpidRegistrationError, DpidUpdateError, WrongOwnerError } from "./errors.js";
import { StreamID } from "@desci-labs/desci-codex-lib/dist/streams.js";
import { typechain as tc } from "@desci-labs/desci-contracts";

const LOG_CTX = "[nodes-lib::chain]"

const DEFAULT_DPID_PREFIX_STRING = "beta";
const DEFAULT_DPID_PREFIX = utils.formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

const researchObjectWriter = (signer: Signer) =>
  getNodesLibInternalConfig().legacyChainConfig.researchObjectConnector(signer);

const dpidRegistryWriter = (signer: Signer) =>
  getNodesLibInternalConfig().legacyChainConfig.dpidRegistryConnector(signer);

const dpidAliasRegistryWriter = (signer: Signer) =>
  getNodesLibInternalConfig().chainConfig.dpidAliasRegistryConnector(signer);

const dpidAliasRegistryReader = (provider: providers.Provider) =>
  getNodesLibInternalConfig().chainConfig.dpidAliasRegistryConnector(provider);

export type DpidPublishResult = {
  prepubResult: PrepublishResponse,
  reciept: ContractReceipt,
};

/**
 * Publish a node to the dPID registry contract.
 *
 * @throws (@link WrongOwnerError) if signer address isn't token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
 * @deprecated
 */
export const dpidPublish = async (
  uuid: string,
  dpidExists: boolean,
  signer: Signer,
): Promise<DpidPublishResult> => {
  let reciept: ContractReceipt;
  let prepubResult: PrepublishResponse;

  if (dpidExists) {
    console.log(`${LOG_CTX} dpid exists for ${uuid}, checking token ownership`);
    const signingAddress = (await signer.getAddress()).toLowerCase();
    const researchObjectOwner = await getTokenOwner(uuid, signer);

    if (signingAddress !== researchObjectOwner) {
      throw new WrongOwnerError({
        name: "WRONG_OWNER_ERROR",
        message: "Credentials do not match the research object token owner",
        cause: { expected: researchObjectOwner, actual: signingAddress },
      });
    };

    console.log(`${LOG_CTX} owner looks OK, trying to update dpid`);
    try {
      prepubResult = await prePublishDraftNode(uuid);
      reciept = await updateExistingDpid(uuid, prepubResult.updatedManifestCid, signer);
    } catch(e) {
      const cause = e as Error;
      console.log(`${LOG_CTX} Failed updating dpid for uuid ${uuid}: ${JSON.stringify(cause, undefined, 2)}`);
      throw new DpidUpdateError({
        name: "DPID_UPDATE_ERROR",
        message: "dPID update failed",
        cause,
      });
    };
  } else {
    console.log(`${LOG_CTX} no dpid found for ${uuid}, registering new`);
    try {
      const registrationResult = await registerNewDpid(uuid, signer);
      reciept = registrationResult.reciept;
      prepubResult = registrationResult.prepubResult;
    } catch (e) {
      const cause = e as Error;
      console.log(`${LOG_CTX} Failed registering new dpid for uuid ${uuid}: ${JSON.stringify(cause, undefined, 2)}`);
      throw new DpidRegistrationError({
        name: "DPID_REGISTRATION_ERROR",
        message: "dPID registration failed",
        cause,
      });
    };
  };
  return { prepubResult, reciept };
};

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
  signer: Signer,
): Promise<{ dpid: number, receipt: ContractReceipt}> => {
  const tx = await dpidAliasRegistryWriter(signer).mintDpid(streamId.toString());
  const receipt = await tx.wait();
  const [ dpid ] = receipt.events?.find(e => e.event === "DpidMinted")?.args!;

  return { dpid, receipt };
};

export const upgradeDpidAlias = async (
  streamId: string,
  dpid: number,
  signer: Signer,
): Promise<ContractReceipt> => {
  const tx = await dpidAliasRegistryWriter(signer)
    .upgradeDpid(BigNumber.from(dpid), streamId);
  return await tx.wait();
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
export const lookupDpid = async (
  dpid: number
): Promise<string> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl
  );
  return await dpidAliasRegistryReader(provider).resolve(dpid);
};

/**
 * Find the dPID alias of a given streamID, a reverse lookup.
*/
export const findDpid = async (
  streamId: string,
): Promise<number> => {
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().chainConfig.rpcUrl
  );
  const dpidBn = await dpidAliasRegistryReader(provider).find(streamId);
  return ethers.BigNumber.from(dpidBn).toNumber();
};

/**
 * Update an existing dPID with a new version of the manifest.
 * @deprecated
 */
const updateExistingDpid = async (
  uuid: string,
  prepubManifestCid: string,
  signer: Signer,
): Promise<ContractReceipt> => {
  const cidBytes = convertCidTo0xHex(prepubManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObjectWriter(signer).updateMetadata(hexUuid, cidBytes);
  return await tx.wait()
};

/**
 * Optimistically create a manifest with the next available dPID,
 * and try to register it as such.
 * @throws on dpid registration failure.
 * @deprecated use createDpidAlias
 */
const registerNewDpid = async (
  uuid: string,
  signer: Signer,
): Promise<{ reciept: ContractReceipt, prepubResult: PrepublishResponse}> => {
  const optimisticDpid = await getPreliminaryDpid(signer);
  const regFee = await dpidRegistryWriter(signer).getFee();

  await changeManifest(
    uuid,
    [{ 
      type: "Publish Dpid",
      dpid: { prefix: DEFAULT_DPID_PREFIX_STRING, id: optimisticDpid.toString() }
    }],
  );

  let prepubResult: PrepublishResponse;
  let reciept: ContractReceipt;
  try {
    prepubResult = await prePublishDraftNode(uuid);
    const cidBytes = convertCidTo0xHex(prepubResult.updatedManifestCid);
    const hexUuid = convertUUIDToHex(uuid);

    // Throws if the expected dPID isn't available
    const tx = await researchObjectWriter(signer).mintWithDpid(
      hexUuid,
      cidBytes,
      DEFAULT_DPID_PREFIX,
      optimisticDpid,
      { value: regFee, gasLimit: 350000 }
    );
    reciept = await tx.wait();
  } catch (e) {
    console.log(`${LOG_CTX} dPID registration failed, revert optimistic dPID in manifest of ${uuid}`)
    await changeManifest(
      uuid, [{ type: "Remove Dpid" }]
    );
    throw e;
  };
  console.log(`${LOG_CTX} Successfully registered as dPID ${optimisticDpid}`);
  return { reciept, prepubResult };
};

/**
 * Get the next dPID up for minting, for creating an optimistic manifest.
 * @returns the next free dPID
 * @deprecated
 */
const getPreliminaryDpid = async (
  signer: Signer,
): Promise<BigNumber> => {
  const [nextFreeDpid, _] = await dpidRegistryWriter(signer)
    .getOrganization(DEFAULT_DPID_PREFIX);
  return nextFreeDpid;
};

/**
 * @deprecated
 */
export const hasDpid = async (
  uuid: string,
  signer: Signer,
): Promise<boolean> =>
  await researchObjectWriter(signer).exists(convertUUIDToHex(uuid));

/**
 * @deprecated
 */
export const getTokenOwner = async (
  uuid: string,
  signer: Signer,
): Promise<string> =>
  (await researchObjectWriter(signer).ownerOf(convertUUIDToHex(uuid))).toLowerCase();;


/**
 * Get the research object token ID for a given (legacy) dPID
*/
export const getTokenId = async (
  dpid: number,
  signer: Signer,
): Promise<BigNumber> => await dpidRegistryWriter(signer).get("beta", dpid);
