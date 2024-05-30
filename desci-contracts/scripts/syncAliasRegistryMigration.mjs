import hardhat from "hardhat";
const { ethers, hardhatArguments } = hardhat;
import axios from "axios";
import { writeFileSync } from "fs";

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
if (REGISTRY_ADDRESS === undefined) {
  throw new Error("REGISTRY_ADDRESS unset");
};

const getDpidPage = async (page) => {
  const { data } = await axios.get(
    `https://dev-beta.dpid.org/api/v1/dpid?size=100&page=${page}`
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
    versions: dpid.researchObject.versions.map(v => ({cid: v.cid, time: v.time}))
  }
];

const importEntries = allDpids.map(toImportEntry);

const DpidAliasRegistryFactory = await ethers.getContractFactory("DpidAliasRegistry");
const registry = DpidAliasRegistryFactory
  .attach(REGISTRY_ADDRESS);

const results = [];
let totalGas = 0;
const startTime = Date.now();

for (const [ dpid, entry ] of importEntries) {
  const [owner, versions] = await registry.legacyLookup(dpid);
  const notImported = owner === "0x0000000000000000000000000000000000000000";

  if (notImported) {
    console.log(`❗ dPID ${dpid} not found, importing...`);
    const tx = await registry.importLegacyDpid(dpid, entry);
    const receipt = await tx.wait();
    totalGas += ethers.BigNumber.from(receipt.gasUsed).toNumber();
  };

  const fromContract = await registry.legacyLookup(dpid);

  const imported = {
    dpid,
    owner: fromContract[0],
    versions: fromContract[1].map(([cid, time]) => ({cid, time: ethers.BigNumber.from(time).toNumber() }))
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


  results.push({ dpid, owner: imported.owner, versions: imported.versions, importError: validationError });
};

const failures = results.filter(r => r.validationError);
console.log(`🚦 dPIDs which failed validation (manually import to overwrite): ${JSON.stringify(failures)}`)

const duration = Math.ceil((Date.now() - startTime) / 1000);
console.log(`🏁 migration done in ${duration}s for a total of ${totalGas} gas`)

const dateString = new Date().toUTCString().replaceAll(" ", "_");
const logFilePath = `migration-data/aliasRegistry_${dateString}.json`;
writeFileSync(logFilePath, JSON.stringify(results, undefined, 2));
console.log(`📝 migration data written to ${logFilePath}`);
