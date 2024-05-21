const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

const dpidRegistry = require("../.openzeppelin/unknown-dpid.json");
const dpidProxyAddress = dpidRegistry.proxies[0].address;

async function main() {
  fs.rmSync(".openzeppelin/unknown-research-object.json", { force: true });
  fs.rmSync(".openzeppelin/unknown-1337.json", { force: true });

  const ResearchObjectV2 = await ethers.getContractFactory("ResearchObjectMigrated");
  console.log(`[deployResearchObject] Deploying ResearchObjectMigrated with dpid proxy ${dpidProxyAddress}...`);
  const proxy = await upgrades.deployProxy(
    ResearchObjectV2,
    [ dpidProxyAddress ],
  );
  await proxy.deployed();
  console.log("[deployResearchObject] ResearchObjectMigrated deployed to:", proxy.address);

  fs.renameSync(
    ".openzeppelin/unknown-1337.json",
    ".openzeppelin/unknown-research-object.json",
  );
}

main();
