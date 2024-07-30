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
import axios from "axios";
import { writeFileSync } from "fs";

const ENV = process.env.ENV;
if (ENV === undefined) {
  throw new Error("ENV unset");
};

let dpidApi;
if (ENV === "dev") {
  dpidApi = "dev-beta";
} else if (ENV === "prod") {
  dpidApi = "beta";
} else {
  throw new Error(`Env "${ENV} unknown (use "dev" or "prod")`);
};

const getDpidPage = async (page) => {
  const { data } = await axios.get(
    `https://${dpidApi}.dpid.org/api/v1/dpid?size=100&page=${page}`
  );
  return data;
};

const allDpids = (await Promise.all(
  [1,2,3].map(getDpidPage)
)).flat().sort((d1, d2) => parseInt(d1.dpid) - parseInt(d2.dpid));

const toImportEntry = (dpid) => [
  dpid.dpid,
  {
    owner: dpid.researchObject.owner,
    versions: dpid.researchObject.versions.map(v => ({cid: v.cid, time: v.time})),
  },
];

const importEntries = allDpids.map(toImportEntry);

const DpidAliasRegistryFactory = await ethers.getContractFactory("DpidAliasRegistry");

const registry = await upgrades.deployProxy(
  DpidAliasRegistryFactory,
  [],
  {
    initializer: "initialize",
  }
);

await registry.deployed();
console.log(`📃 Contract deployed to ${registry.address}`);

const results = {
  address: registry.address,
  dpids: [],
};
let totalGas = 0;
const startTime = Date.now();

for (const [ dpid, entry ] of importEntries) {
  console.log(`📥 Importing dPID ${dpid}...`)
  const tx = await registry.importLegacyDpid(dpid, entry);
  const receipt = await tx.wait();
  totalGas += ethers.BigNumber.from(receipt.gasUsed).toNumber();

  const fromContract = await registry.legacyLookup(dpid);

  const imported = {
    dpid,
    owner: fromContract[0],
    versions: fromContract[1].map(([cid, time]) => ({cid, time: ethers.BigNumber.from(time).toNumber() })),
  };

  console.log(`🔎 Verifying dPID ${dpid}:`);

  const originalDpid = allDpids.find(e => e.dpid === dpid);
  const originalOwner = originalDpid.researchObject.owner;
  const originalVersions = originalDpid.researchObject.versions;

  let validationError = false;

  const ownerCorrect = originalOwner === imported.owner.toLowerCase();
  console.log(`   - Ownership: ${ownerCorrect ? "✅" : "❌"} (${originalOwner})`);
  if (!ownerCorrect) validationError = true;

  console.log(`   - History:`)
  for (let i = 0; i < originalVersions.length; i++) {
    console.log(`     - v${i}:`)
    const cidCorrect = originalVersions[i].cid === imported.versions[i].cid;
    const timeCorrect = originalVersions[i].time === imported.versions[i].time;

    console.log(`       - cid:  ${cidCorrect ? "✅" : "❌"} (${originalVersions[i].cid})`);
    console.log(`       - time: ${timeCorrect ? "✅" : "❌"} (${originalVersions[i].time})`);
    if (!(cidCorrect && timeCorrect)) {
      validationError = true;
    };
  };
  results.dpids.push({ dpid, owner: imported.owner, versions: imported.versions, validationError });
};

const failures = results.dpids.filter(r => r.validationError);
console.log(`🚦 dPIDs which failed validation: ${JSON.stringify(failures)}`)

const missingNumbers = [];
for (let i = 0; i < importEntries.length; i++) {
  if (!allDpids.find(e => e.dpid === i.toString())) {
    missingNumbers.push(i);
  };
};

console.log(`❓ dPID's missing from original set: ${JSON.stringify(missingNumbers)}`);

const duration = Math.ceil((Date.now() - startTime) / 1000);
console.log(`🏁 migration done in ${duration}s for a total of ${totalGas} gas`);

const dateString = new Date().toUTCString().replaceAll(" ", "_");
const logFilePath = `migration-data/aliasRegistry_${dateString}.json`;
writeFileSync(logFilePath, JSON.stringify(results, undefined, 2));
console.log(`📝 migration data written to ${logFilePath}`);
