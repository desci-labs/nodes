const { ethers, upgrades } = require("hardhat");
const dpidRegistry = require("../.openzeppelin/goerli-dpid.json");
const researchObject = require("../.openzeppelin/goerli-research-object.json");
const fs = require("fs");
async function main() {
  const ResearchObject = await ethers.getContractFactory("ResearchObject");
  console.log("Upgrading ResearchObject...");
  // fs.writeFileSync(
  //   ".openzeppelin/goerli.json",
  //   JSON.stringify(researchObject)
  // );
  // throw Error("n");
  const upgraded = await upgrades.upgradeProxy(
    researchObject.proxies[0].address,
    ResearchObject,
    [dpidRegistry.proxies[0].address]
  );
  // fs.rmSync(".openzeppelin/goerli.json");
  console.log("ResearchObject upgraded", upgraded);
}

main();
