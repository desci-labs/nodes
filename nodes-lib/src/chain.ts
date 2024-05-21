import { BigNumber, ContractReceipt, Signer } from "ethers";
import { convertUUIDToHex, convertCidTo0xHex} from "./util/converting.js";
import { changeManifest, prePublishDraftNode, type PrepublishResponse } from "./api.js"
import { getNodesLibInternalConfig } from "./config/index.js";
import { formatBytes32String } from "ethers/lib/utils.js";
import { DpidRegistrationError, DpidUpdateError, WrongOwnerError } from "./errors.js";

const LOG_CTX = "[nodes-lib::chain]"

const DEFAULT_DPID_PREFIX_STRING = "beta";
const DEFAULT_DPID_PREFIX = formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

const researchObjectContract = (signer: Signer) =>
  getNodesLibInternalConfig().chainConfig.researchObjectConnector(signer);

const dpidRegistryContract = (signer: Signer) =>
  getNodesLibInternalConfig().chainConfig.dpidRegistryConnector(signer);

export type DpidPublishResult = {
  prepubResult: PrepublishResponse,
  reciept: ContractReceipt,
};

/**
 * Publish a node to the dPID registry contract.
 *
 * @throws (@link WrongOwnerError) if signer address isn't token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
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
    const researchObjectOwner = await getResearchObjectOwner(uuid, signer);

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
 * Update an existing dPID with a new version of the manifest.
 */
const updateExistingDpid = async (
  uuid: string,
  prepubManifestCid: string,
  signer: Signer,
): Promise<ContractReceipt> => {
  const cidBytes = convertCidTo0xHex(prepubManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObjectContract(signer).updateMetadata(hexUuid, cidBytes);
  return await tx.wait()
};

/**
 * Optimistically create a manifest with the next available dPID,
 * and try to register it as such.
 * @throws on dpid registration failure.
 */
const registerNewDpid = async (
  uuid: string,
  signer: Signer,
): Promise<{ reciept: ContractReceipt, prepubResult: PrepublishResponse}> => {
  const optimisticDpid = await getPreliminaryDpid(signer);
  const regFee = await dpidRegistryContract(signer).getFee();

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
    const tx = await researchObjectContract(signer).mintWithDpid(
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
  signer: Signer,
): Promise<BigNumber> => {
  const [nextFreeDpid, _] = await dpidRegistryContract(signer)
    .getOrganization(DEFAULT_DPID_PREFIX);
  return nextFreeDpid;
};

export const hasDpid = async (
  uuid: string,
  signer: Signer,
): Promise<boolean> =>
  await researchObjectContract(signer).exists(convertUUIDToHex(uuid));

export const getResearchObjectOwner = async (
  uuid: string,
  signer: Signer,
): Promise<string> =>
  (await researchObjectContract(signer).ownerOf(convertUUIDToHex(uuid))).toLowerCase();;
