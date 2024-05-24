import hardhat from "hardhat";
const { ethers } = hardhat;
import axios from "axios";

const getDpidPage = async (page) => {
  const { data } = await axios.get(
    `https://dev-beta.dpid.org/api/v1/dpid?size=100&page=${page}`
  );
  return data;
};

const allDpids = (await Promise.all(
  [1,2,3].map(getDpidPage)
)).flat();

const toImportEntry = (dpid) => [
  dpid.dpid,
  {
    owner: dpid.researchObject.owner,
    versions: dpid.researchObject.versions.map(v => ({cid: v.cid, time: v.time}))
  }
];

const importEntries = allDpids.map(toImportEntry);

const DpidAliasRegistryFactory = await ethers.getContractFactory("DpidAliasRegistry");

const registry = await upgrades.deployProxy(
  DpidAliasRegistryFactory,
  [
    500 // firstDpid
  ],
  {
    initializer: "__DpidAliasRegistry_init"
  }
);

await registry.deployed();

const sliceToImport = importEntries.slice(0,5);
console.log("Importing dPIDs:", sliceToImport.map(s => s[0]).join(", "))

const results = [];

for (const [ dpid, entry ] of importEntries.slice(0, 5)) {
  console.log(`✨ Importing dPID ${dpid}...`)
  await registry.importLegacyDpid(dpid, entry);

  console.log(`🔎 Resolving dPID ${dpid} from new contract...`)
  const fromContract = await registry.legacyLookup(dpid);

  const result = {
    dpid,
    owner: fromContract[0],
    versions: fromContract[1].map(([cid, time]) => ({cid, time: ethers.BigNumber.from(time).toNumber() }))
  };

  console.log(`🎊 Found migrated history of dPID ${dpid} in new contract: \n${JSON.stringify(result, undefined, 2)}`)
  console.log("-----------------------------------------------------------------")
};

