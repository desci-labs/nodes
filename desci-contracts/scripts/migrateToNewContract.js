const { ethers, upgrades } = require("hardhat");
/**
 * Migrate dpid registry + researchobject states from another network/contract to a new target network/contract
 *
 * Uses existing graph index to migrate the data
 *
 * In production, ensure the source contract is paused BEFORE running this, to ensure no new data is added during/after the migration
 *
 * In production, the import can only be run once
 *
 * To keep previous event log times, we will migrate the timestamps as a new field in the event added to DpidRegistryV2
 */

const axios = require("axios");
const { base16 } = require("multiformats/bases/base16");
const { CID } = require("multiformats/cid");

const convertCidStringToHex = (cid) => {
  const cidObj = CID.parse(cid);
  const cidHex = cidObj.toString(base16);
  return cidHex;
};

// interface MigrationDataStruct {
//   from: string;
//   uuid: BigNumberish;
//   cid: BytesLike;
//   timestamp: BigNumberish;
//   dpid: BigNumberish;
// }

const GRAPH_API_URL = "https://graph-goerli-dev.desci.com/subgraphs/name/nodes";

const query = async () => {
  const query = `{
    researchObjects(first: 1000) {
      id, id10, recentCid, owner, versions(orderBy: time, orderDirection: desc) {
        cid, id, time
      }
    } 
  }`;
  const payload = JSON.stringify({
    query,
  });
  const { data } = await axios.post(GRAPH_API_URL, payload);
  if (data.errors) {
    console.error(
      { fn: "query", err: data.errors, query, dataRes: data },
      `graph index query err ${query}`
    );
    throw Error(JSON.stringify(data.errors));
  }
  return data.data;
};

const getDpidPage = async (page) => {
  const { data } = await axios.get(
    `https://beta.dpid.org/api/v1/dpid?size=100&page=${page}`
  );
  return data;
};

// pull the data from the graph index
const getDpidRegistryData = async () => {
  const data = await query();

  console.log("getDpidRegistryData");
  console.log(data);
  return data;
};

const idToDpid = {};
const idToRo = {};
(async () => {
  const dpidData = [
    await getDpidPage(1),
    await getDpidPage(2),
    await getDpidPage(3),
  ].flat();
  const data = await getDpidRegistryData();
  dpidData.forEach((d) => {
    idToDpid[d.researchObject.id] = d;
  });
  data.researchObjects.forEach((d) => {
    idToRo[d.id] = d;
  });
  const dpidIds = Object.keys(idToDpid);
  console.log(data, dpidData, Object.keys(idToRo), Object.keys(idToDpid));

  const unified = dpidIds
    .map((id) => {
      return idToDpid[id].researchObject.versions.map((v, i) => ({
        from: idToRo[id].owner,
        uuid: idToDpid[id].researchObject.id,
        cid: idToRo[id].versions[idToRo[id].versions.length - i - 1].cid,
        timestamp: v.time,
        dpid: idToDpid[id].dpid,
      }));
    })
    .flat()
    .reverse();
  console.log(unified);

  // write to JSON file
  const fs = require("fs");
  fs.writeFileSync(
    `migrationData_${new Date().toDateString()}.json`,
    JSON.stringify(unified)
  );

  process.exit(1);

  const DpidRegistryMigrated = await ethers.getContractFactory("DpidRegistry");
  console.log("[deployDpidRegistryMigrated] Deploying DpidRegistryMigrated...");
  const proxyDpid = await upgrades.deployProxy(DpidRegistryMigrated, []);
  await proxyDpid.deployed();
  console.log(
    "[deployDpidRegistry] DpidRegistry deployed to:",
    proxyDpid.address
  );

  const ResearchObjectMigrated = await ethers.getContractFactory(
    "ResearchObjectMigrated"
  );
  console.log(
    "[deployResearchObjectMigrated] Deploying ResearchObjectMigrated..."
  );
  const DEFAULT_PREFIX = ethers.utils.formatBytes32String("");
  const proxy = await upgrades.deployProxy(ResearchObjectMigrated, [
    proxyDpid.address,
  ]);
  await proxy.deployed();

  await proxyDpid.setFee(0);

  const result = await proxy._importChunk(unified, DEFAULT_PREFIX);
  console.log("result", result);

  console.log(
    "[deployResearchObjectMigrated] ResearchObjectMigrated deployed to:",
    proxy.address
  );
})();
