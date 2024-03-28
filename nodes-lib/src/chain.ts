import { BigNumber, ContractReceipt, Signer, providers } from "ethers";
import { convertUUIDToHex, convertCidTo0xHex} from "./util/converting.js";
import { changeManifest, prePublishDraftNode, type PrepublishResponse } from "./api.js"
import { getConfig } from "./config/index.js";
import { formatBytes32String } from "ethers/lib/utils.js";

const LOG_CTX = "[nodes-lib::chain]"

const DEFAULT_DPID_PREFIX_STRING = "beta";
const DEFAULT_DPID_PREFIX = formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

const researchObjectContract = (signer: Signer) =>
  getConfig().chainConfig.researchObjectConnector(signer);

const dpidRegistryContract = (signer: Signer) =>
  getConfig().chainConfig.dpidRegistryConnector(signer);

export type DpidPublishResult = {
  prepubResult: PrepublishResponse,
  reciept: ContractReceipt,
};

/**
 * Publish a node to the dPID registry contract.
 */
export const dpidPublish = async (
  uuid: string,
  dpidExists: boolean,
  provider: providers.Web3Provider,
): Promise<DpidPublishResult> => {
  let reciept: ContractReceipt;
  let prepubResult: PrepublishResponse;
  if (dpidExists) {
    console.log(`${LOG_CTX} dpid exists for ${uuid}, updating`);
    try {
      prepubResult = await prePublishDraftNode(uuid);
      reciept = await updateExistingDpid(uuid, prepubResult.updatedManifestCid, provider);
    } catch(e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed updating dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
  } else {
    console.log(`${LOG_CTX} no dpid found for ${uuid}, registering new`);
    try {
      const registrationResult = await registerNewDpid(uuid, provider);
      reciept = registrationResult.reciept;
      prepubResult = registrationResult.prepubResult;
    } catch (e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed registering new dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
  };
  return { prepubResult, reciept };
};

/**
 * Update an existing dPID with a new version of the manifest.
 */
const updateExistingDpid = async (
  uuid: string,
  prepubManifestCid: string,
  provider: providers.Web3Provider,
): Promise<ContractReceipt> => {
  const cidBytes = convertCidTo0xHex(prepubManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObjectContract(provider.getSigner()).updateMetadata(hexUuid, cidBytes);
  return await tx.wait()
};

/**
 * Optimistically create a manifest with the next available dPID,
 * and try to register it as such.
 * @throws on dpid registration failure.
 */
const registerNewDpid = async (
  uuid: string,
  provider: providers.Web3Provider,
): Promise<{ reciept: ContractReceipt, prepubResult: PrepublishResponse}> => {
  const optimisticDpid = await getPreliminaryDpid(provider);
  const regFee = await dpidRegistryContract(provider.getSigner()).getFee();

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
    const tx = await researchObjectContract(provider.getSigner()).mintWithDpid(
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
 */
const getPreliminaryDpid = async (
  provider: providers.Web3Provider,
): Promise<BigNumber> => {
  const [nextFreeDpid, _] = await dpidRegistryContract(provider.getSigner())
    .getOrganization(DEFAULT_DPID_PREFIX);
  return nextFreeDpid;
};

export const hasDpid = async (
  uuid: string,
  provider: providers.Web3Provider
): Promise<boolean> =>
  await researchObjectContract(provider.getSigner()).exists(convertUUIDToHex(uuid));
