import { Wallet, getDefaultProvider, type ContractReceipt } from "ethers";
import { DpidRegistry__factory, ResearchObject__factory } from "@desci-labs/desci-contracts/typechain-types";
import { SigningKey, formatBytes32String } from "ethers/lib/utils.js";
import { convertUUIDToHex, getBytesFromCIDString } from "./util/converting.js";
import { prePublishDraftNode } from "./api.js"

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

export const chainPublish = async (
  uuid: string,
  authToken: string,
): Promise<ContractReceipt> => {
  const hasDpid = await researchObject.exists(convertUUIDToHex(uuid));

  let reciept: ContractReceipt;
  if (hasDpid) {
    console.log(`${LOG_CTX} dpid exists for ${uuid}, updating`);
    try {
      reciept = await updateExistingDpid(uuid, authToken);
    } catch(e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed updating dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
    console.log(`${LOG_CTX} dpid update reciept: ${JSON.stringify(reciept, undefined, 2)}`);
  } else {
    console.log(`${LOG_CTX} no dpid found for ${uuid}, registering new`);
    try {
      reciept = await registerNewDpid(uuid, authToken);
    } catch (e) {
      const err = e as Error;
      console.log(`${LOG_CTX} Failed registering new dpid for uuid ${uuid}: ${err.message}`);
      throw err;
    };
    console.log(`${LOG_CTX} dpid registration reciept: ${JSON.stringify(reciept, undefined, 2)}`);
  };
  return reciept;
};

const updateExistingDpid = async (
  uuid: string,
  authToken: string
): Promise<ContractReceipt> => {
  const { updatedManifestCid } = await prePublishDraftNode(uuid, authToken);
  const cidBytes = getBytesFromCIDString(updatedManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  
  const tx = await researchObject.updateMetadata(hexUuid, cidBytes);
  return await tx.wait();
};

const registerNewDpid = async (
  uuid: string,
  authToken: string,
): Promise<ContractReceipt> => {
  const [nextFreeDpid, _] = await dpidRegistry.getOrganization(DEFAULT_DPID_PREFIX);
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

  const { updatedManifestCid }= await prePublishDraftNode(uuid, authToken);
  const cidBytes = getBytesFromCIDString(updatedManifestCid);
  const hexUuid = convertUUIDToHex(uuid);
  const tx = await researchObject.mintWithDpid(
      hexUuid,
      cidBytes,
      DEFAULT_DPID_PREFIX,
      nextFreeDpid,
      { value: regFee, gasLimit: 350000 }
  );
  return await tx.wait();
}

export const checkDpid = async (
  uuid: string,
): Promise<number> => {
  const bigNumberDpid = await dpidRegistry.get(
    DEFAULT_DPID_PREFIX, convertUUIDToHex(uuid)
  );
  return bigNumberDpid.toNumber();
};

