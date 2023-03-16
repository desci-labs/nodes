const { ethers, upgrades } = require("hardhat");
const dpidRegistry = require("../.openzeppelin/goerli-dpid.json");
const researchObject = require("../.openzeppelin/goerli-research-object.json");
const fs = require("fs");
async function main() {
  const ResearchObject = await ethers.getContractFactory("ResearchObject");
  console.log("importing ResearchObject...");
  // fs.writeFileSync(
  //   ".openzeppelin/goerli.json",
  //   JSON.stringify(researchObject)
  // );

  // throw Error("n");
  const upgraded = await upgrades.forceImport(
    "0x2362ebD12dfEf7563D43658E7D06C85558997F3C",
    ResearchObject,
    { kind: "transparent" }
  );
  // fs.rmSync(".openzeppelin/goerli.json");
  console.log("ResearchObject imported", upgraded);
}

main();
