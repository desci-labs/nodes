/**
 * run this like
 * npx ts-node --project scripts/tsconfig.script.json scripts/finishMigrationFromSnapshot.ts
 *
 *
 *
 * TS_NODE_PROJECT=scripts/tsconfig.script.json  node --loader ts-node/esm scripts/finishMigrationFromSnapshot.ts
 */

const { ethers, upgrades, hardhatArguments } = require("hardhat");
const { SigningKey } = require("ethers/lib/utils");
const { Wallet, getDefaultProvider, Contract } = require("ethers");
const ETHEREUM_RPC_URL = "https://1rpc.io/sepolia";
const ethereumProvider = getDefaultProvider(ETHEREUM_RPC_URL);

const researchObjectABI =
  require("../artifacts/contracts/migrated/ResearchObjectMigrated.sol/ResearchObjectMigrated.json").abi;
const dpidRegistryAbi =
  require("../artifacts/contracts/DpidRegistry.sol/DpidRegistry.json").abi;

/**
 * Given a deployed contract (DpidRegistry + ResearchObject), load a snapshot into it via the ResearchObjectMigrated tool
 */

const networkName = hardhatArguments.network;

console.log({ networkName });

const walletFromPkey = (pkey) => {
  pkey = pkey.startsWith("0x") ? pkey : `0x${pkey}`;
  const key = new SigningKey(pkey);
  return new Wallet(key, ethereumProvider);
};

const wallet = walletFromPkey(process.env.PRIVATE_KEY);

const RO_CONTRACT_ADDRESS = "0x41198b022a912a0133cf8cefce114f1af65dafab";
const DPID_CONTRACT_ADDRESS = "0xb9F1b29d9435Ff4772F57067C927367B337B0456";

const DEFAULT_PREFIX = ethers.utils.formatBytes32String("beta");

(async () => {
  const unified = require("../migration-data/migrationData_Thu Mar 14 2024.json");

  const researchObjectContract = new Contract(
    RO_CONTRACT_ADDRESS,
    researchObjectABI,
    wallet
  );

  const dpidRegistryContract = new Contract(
    DPID_CONTRACT_ADDRESS,
    dpidRegistryAbi,
    wallet
  );

  // split unified array into chunks
  const chunkSize = 100;
  const chunks = [];
  for (let i = 103; i < unified.length; i += chunkSize) {
    chunks.push(unified.slice(i, i + chunkSize));
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log("chunk", i, chunk);
    const result = await researchObjectContract._importChunk(
      chunk,
      DEFAULT_PREFIX,
      {
        gasLimit: 21409261,
      }
    );
    console.log("result", result);
    await new Promise((r) => setTimeout(r, 50));
  }
})();
