import { Wallet, getDefaultProvider, type ContractReceipt, BigNumber } from "ethers";
import { SigningKey, formatBytes32String } from "ethers/lib/utils.js";
import { ResearchObject__factory, DpidRegistry__factory } from "@desci-labs/desci-contracts/typechain-types";
import { convertUUIDToHex, convertCidTo0xHex} from "./util/converting.js";
import { changeManifest, prePublishDraftNode, type PrepublishResponse } from "./api.js"
import {
  RO_CONTRACT_ADDRESS,
  DPID_CONTRACT_ADDRESS,
  ETHEREUM_RPC_URL,
  PUBLISH_PKEY,
} from "./config.js";

const LOG_CTX = "[nodes-lib::chain]"

const DEFAULT_DPID_PREFIX_STRING = "beta";
const DEFAULT_DPID_PREFIX = formatBytes32String(DEFAULT_DPID_PREFIX_STRING);

const ethereumProvider = getDefaultProvider(ETHEREUM_RPC_URL);

const walletFromPkey = (pkey: string): Wallet => {
  pkey = pkey.startsWith("0x") ? pkey : `0x${pkey}`;
  const key = new SigningKey(pkey);
  return new Wallet(key, ethereumProvider);
};

const wallet = walletFromPkey(PUBLISH_PKEY);
const researchObject = ResearchObject__factory.connect(
  RO_CONTRACT_ADDRESS, wallet
);
const dpidRegistry = DpidRegistry__factory.connect(
  DPID_CONTRACT_ADDRESS, wallet
);

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
): Promise<DpidPublishResult> => {
  let reciept: ContractReceipt;
  let prepubResult: PrepublishResponse;
  if (dpidExists) {
    console.log(`${LOG_CTX} dpid exists for ${uuid}, updating`);
    try {
      prepubResult = await prePublishDraftNode(uuid);
      reciept = await updateExistingDpid(uuid, prepubResult.updatedManifestCid);
    } catch(e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed updating dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
  } else {
    console.log(`${LOG_CTX} no dpid found for ${uuid}, registering new`);
    try {
      const registrationResult = await registerNewDpid(uuid);
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
  const cidBytes = convertCidTo0xHex(prepubManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObject.updateMetadata(hexUuid, cidBytes);
  return await tx.wait();
};

/**
 * Optimistically create a manifest with the next available dPID,
 * and try to register it as such.
 * @throws on dpid registration failure.
 */
const registerNewDpid = async (
  uuid: string,
): Promise<{ reciept: ContractReceipt, prepubResult: PrepublishResponse}> => {
  const optimisticDpid = await getPreliminaryDpid();
  const regFee = await dpidRegistry.getFee();

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
    const tx = await researchObject.mintWithDpid(
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

  return { reciept, prepubResult };
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
