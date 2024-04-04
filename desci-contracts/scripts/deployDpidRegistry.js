const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

console.log(process.cwd())
async function main() {
  fs.rmSync(".openzeppelin/unknown-dpid.json", { force: true });
  fs.rmSync(".openzeppelin/unknown-1337.json", { force: true });

  const DpidRegistry = await ethers.getContractFactory("DpidRegistry");
  console.log("[deployDpidRegistry] Deploying DpidRegistry...");
  const proxy = await upgrades.deployProxy(DpidRegistry, []);
  await proxy.deployed();
  console.log("[deployDpidRegistry] DpidRegistry deployed to:", proxy.address);

  fs.renameSync(
    ".openzeppelin/unknown-1337.json",
    ".openzeppelin/unknown-dpid.json",
  );
}

main();
