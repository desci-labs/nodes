/**
 * ALIAS REGISTRY ACTIVATION
 *
 * Activates a dPID alias contract, by setting the next available dPID and
 * unpausing it. The old contract needs to be paused, so no overlapping dPID's
 * are minted. Alternatively, set the next dPID with some gap in between.
 *
 * Required arguments (env variables):
 * 1. REGISTRY_ADDRESS - Address of existing alias registry (proxy) contract
 * 2. PRIVATE_KEY - Owner/admin identity (see hardhat.config.ts)
 * 2. NEXT_DPID - The next mintable dPID
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
