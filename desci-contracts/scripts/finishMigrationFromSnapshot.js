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
const ETHEREUM_RPC_URL =
  "https://eth-sepolia.g.alchemy.com/v2/Dg4eT90opKOFZ7w-YCxVwX9O-sriKn0N";
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

// const RO_CONTRACT_ADDRESS = "0xbddc15A55339fCedb56b72Bb32eC65A0eFaC7540";
// const DPID_CONTRACT_ADDRESS = "0xAA77454C456265C6d2542b356289BA2BaAbA7BAa";
// const RO_CONTRACT_ADDRESS = "0xbddc15A55339fCedb56b72Bb32eC65A0eFaC7540";
// const DPID_CONTRACT_ADDRESS = "0x3D7BEaC4925a59B7cce2f6Ca6D2b50C1E4822759";
const RO_CONTRACT_ADDRESS = "0x1fA4c72680af35FE1eb7345509E39498be6Ce03b";
const DPID_CONTRACT_ADDRESS = "0x0215242e85D7c480bEAb862cEb9AD6829C1D74E7";

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
  const chunkSize = 1;
  const chunks = [];
  for (let i = 0; i < unified.length; i += chunkSize) {
    chunks.push(unified.slice(i, i + chunkSize));
  }
  for (let i = 64; i < chunks.length; i++) {
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
