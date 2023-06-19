const { ethers, upgrades } = require("hardhat");

async function main() {
  const DpidRegistry = await ethers.getContractFactory("DpidRegistry");
  console.log("[deployDpidRegistry] Deploying DpidRegistry...");
  const proxy = await upgrades.deployProxy(DpidRegistry, []);
  await proxy.deployed();
  console.log("[deployDpidRegistry] DpidRegistry deployed to:", proxy.address);
}

main();
