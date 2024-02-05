import { Wallet, getDefaultProvider, type ContractReceipt, BigNumber } from "ethers";
import { DpidRegistry__factory, ResearchObject__factory } from "@desci-labs/desci-contracts/typechain-types";
import { SigningKey, formatBytes32String } from "ethers/lib/utils.js";
import { convertUUIDToHex, getBytesFromCIDString} from "./util/converting.js";
import { prePublishDraftNode, type PrepublishResponse } from "./api.js"

const LOG_CTX = "[nodes-lib::chain]"
const LC_RO_CONTRACT_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const LC_DPID_CONTRACT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const PROVIDER = getDefaultProvider("http://localhost:8545")
const DEFAULT_DPID_PREFIX_STRING = "beta";
const DEFAULT_DPID_PREFIX = formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

const walletFromPkey = (pkey: string): Wallet => {
  pkey = pkey.startsWith("0x") ? pkey : `0x${pkey}`;
  const key = new SigningKey(pkey);
  return new Wallet(key, PROVIDER);
};

const wallet = walletFromPkey(process.env.PKEY!);
const researchObject = ResearchObject__factory.connect(
  LC_RO_CONTRACT_ADDRESS, wallet
);
const dpidRegistry = DpidRegistry__factory.connect(
  LC_DPID_CONTRACT_ADDRESS, wallet
);

export type ChainPublishResult = {
  prepubResult: PrepublishResponse,
  reciept: ContractReceipt,
};

/**
 * Publish a node to the dPID registry contract.
 */
export const chainPublish = async (
  uuid: string,
  authToken: string,
  dpidExists: boolean,
): Promise<ChainPublishResult> => {
  let reciept: ContractReceipt;
  let prepubResult: PrepublishResponse;
  if (dpidExists) {
    console.log(`${LOG_CTX} dpid exists for ${uuid}, updating`);
    try {
      prepubResult = await prePublishDraftNode(uuid, authToken);
      reciept = await updateExistingDpid(uuid, prepubResult.updatedManifestCid);
    } catch(e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed updating dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
  } else {
    console.log(`${LOG_CTX} no dpid found for ${uuid}, registering new`);
    try {
      const registrationResult = await registerNewDpid(uuid, authToken);
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
  prepubManifestCid: string
): Promise<ContractReceipt> => {
  const cidBytes = getBytesFromCIDString(prepubManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObject.updateMetadata(hexUuid, cidBytes);
  return await tx.wait();
};

/**
 * Optimistically create a manifest with the next available dPID,
 * and try to register it as such.
 */
const registerNewDpid = async (
  uuid: string,
  authToken: string,
): Promise<{ reciept: ContractReceipt, prepubResult: PrepublishResponse}> => {
  const optimisticDpid = await getPreliminaryDpid();
  const regFee = await dpidRegistry.getFee();

  // TODO merge with update operation below, not to have to re-fetch doc
  // const optimisticDpidManifest: ResearchObjectV1 = {
  //   ...manifest,
  //   dpid: {
  //     prefix: DEFAULT_DPID_PREFIX,
  //     id: nextFreeDpid.toString(),
  //   },
  // };
  // Update manifest in DB and add to IPFS
  // const response = await updateDraft(uuid, optimisticDpidManifest)
  // check response OK

  const prepubResult = await prePublishDraftNode(uuid, authToken);
  const cidBytes = getBytesFromCIDString(prepubResult.updatedManifestCid);
  const hexUuid = convertUUIDToHex(uuid);

  // Throws if the expected dPID isn't available
  const tx = await researchObject.mintWithDpid(
      hexUuid,
      cidBytes,
      DEFAULT_DPID_PREFIX,
      optimisticDpid,
      { value: regFee, gasLimit: 350000 }
  );
  return { reciept: await tx.wait(), prepubResult };
};

/**
 * Get the next dPID up for minting, for creating an optimistic manifest.
 * @returns the next free dPID
 */
const getPreliminaryDpid = async (): Promise<BigNumber> => {
  const [nextFreeDpid, _] = await dpidRegistry.getOrganization(DEFAULT_DPID_PREFIX);
  return nextFreeDpid;
};

export const hasDpid = async (
  uuid: string,
): Promise<boolean> =>
  await researchObject.exists(convertUUIDToHex(uuid));
