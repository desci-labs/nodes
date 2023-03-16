const { ethers, upgrades } = require("hardhat");
const dpidRegistry = require("../.openzeppelin/unknown-dpid.json");
const researchObject = require("../.openzeppelin/unknown-research-object.json");
const fs = require("fs");
async function main() {
  const ResearchObject = await ethers.getContractFactory("ResearchObject");
  console.log("Upgrading ResearchObject...");
  fs.writeFileSync(
    ".openzeppelin/unknown-1337.json",
    JSON.stringify(researchObject)
  );
  // throw Error("n");
  const upgraded = await upgrades.upgradeProxy(
    researchObject.proxies[0].address,
    ResearchObject,
    [dpidRegistry.proxies[0].address]
  );
  fs.rmSync(".openzeppelin/unknown-1337.json");
  console.log("ResearchObject upgraded", upgraded);
}

main();
