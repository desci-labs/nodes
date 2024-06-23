/**
 * ALIAS REGISTRY MIGRATION
 *
 * Deploys a new dPID alias registry, through proxy. Imports existing dPID's as
 * legacy entries, and validates the correctness of these imports afterward.
 * If the imports are interrupted, it can be continued using the syncAliasRegistryMigration.mjs
 * script. The registry is initialized in a paused state, meaning minting new dPID's
 * is disabled, but imports and other administration like configuring the dPID
 * counter can still be done.
 *
 * The script performs the following actions:
 * - Deploys new instance of the registry
 * - Imports legacy dPID's, validating correctness
 * - Immediately pauses minting of new dPID's
 *
 * Steps required to fully activate:
 * - Admin calls `setNextDpid` to whatever is the next when legacy contract is disabled
 * - Admin calls `unpause` to allow minting new dPID's
 *
 * Required arguments (env variables):
 * 1. PRIVATE_KEY - Owner/admin identity (see hardhat.config.ts)
 * 2. ENV - Environment to sync legacy entires from ("dev" or "prod")
 */
import hardhat from "hardhat";
const { ethers, hardhatArguments } = hardhat;

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
if (REGISTRY_ADDRESS === undefined) {
  throw new Error("REGISTRY_ADDRESS unset");
};

const NEXT_DPID = process.env.NEXT_DPID;
if (NEXT_DPID === undefined) {
  throw new Error("NEXT_DPID unset");
};

const DpidAliasRegistryFactory = await ethers.getContractFactory("DpidAliasRegistry");
const registry = DpidAliasRegistryFactory.attach(REGISTRY_ADDRESS);

const setNextDpid = await registry.setNextDpid(NEXT_DPID)
await setNextDpid.wait();

const unpause = await registry.unpause();
await unpause.wait();

console.log(`🐎 let dPID minting commence from ${NEXT_DPID} at ${REGISTRY_ADDRESS}`);
