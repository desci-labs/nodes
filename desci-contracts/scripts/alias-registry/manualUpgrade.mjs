/**
 * MANUAL DPID UPGRADE
 *
 * Manually upgrade a legacy dPID to an alias, e.g., bind a streamID
 * to a dPID in `registry` and `reverseRegistry` mappings.
 *
 * Notes:
 * - This prevents (unpriviligied) binding of this stream ID to another dPID
 *
 * Required arguments (env variables):
 * 1. ENV - dev or prod
 * 2. REGISTRY_ADDRESS - Address of existing alias registry (proxy) contract
 * 3. PRIVATE_KEY - Owner/admin identity (see hardhat.config.ts)
 * 4. DPID - The dPID to bind
 * 5. STREAM_ID - The streamID to bind
 * 6. CONFIRM - Set "yes" to actually execute, otherwise run only checks
 */
import hardhat from "hardhat";
const { ethers } = hardhat;

const ENV = process.env.ENV;
if (!(ENV === "dev" || ENV === "prod")) {
  throw new Error('ENV unset (wanted "dev" or "prod")');
};

const CERAMIC_API = `https://ceramic-${ENV}.desci.com/api/v0/streams/`;

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
if (!REGISTRY_ADDRESS) {
  throw new Error("REGISTRY_ADDRESS unset");
};

const DPID = process.env.DPID;
if (!DPID) {
  throw new Error("DPID unset");
};

const STREAM_ID = process.env.STREAM_ID;
if (!STREAM_ID) {
  throw new Error("STREAM_ID unset");
};

const DpidAliasRegistryFactory = await ethers.getContractFactory("DpidAliasRegistry");
const registry = DpidAliasRegistryFactory.attach(REGISTRY_ADDRESS);

const dpidLookup = await registry.resolve(DPID);
const freeDpid = dpidLookup === "";
console.log(`➡ dPID ${DPID} unbound: ${freeDpid ? "✅" : "❌"}`);

const reverseLookup = await registry.find(STREAM_ID);
const freeStreamID = reverseLookup.toNumber() === 0;
console.log(`➡ Stream ${STREAM_ID} unbound: ${freeStreamID ? "✅" : "❌"}`);

const [legacyOwner, _versions ] = await registry.legacyLookup(DPID);
const res = await fetch(CERAMIC_API + STREAM_ID);
const body = await res.json();
const streamController = res.ok
  ? body.state.metadata.controllers[0]
  : "UNKNOWN";
const sameOwner = legacyOwner.toLowerCase() === streamController.split(":").pop();
console.log(
  `➡ Same owner: ${sameOwner ? "✅" : "❌"}`,
  { legacyOwner, streamController }
);

console.log();
if (process.env.CONFIRM === "yes") {
  const setNextDpid = await registry.upgradeDpid(NEXT_DPID)
  await setNextDpid.wait();
  console.log(`🆙 Bound ${DPID} to ${STREAM_ID}`);
} else {
  console.log(`🙅 Skipping binding ${DPID} to ${STREAM_ID} (set CONFIRM to execute)`);
}
