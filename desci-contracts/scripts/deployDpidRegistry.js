const { ethers, upgrades } = require("hardhat");

async function main() {
  const DpidRegistry = await ethers.getContractFactory("DpidRegistry");
  console.log("Deploying DpidRegistry...");
  const proxy = await upgrades.deployProxy(DpidRegistry, []);
  await proxy.deployed();
  console.log("DpidRegistry deployed to:", proxy.address);
}

main();
