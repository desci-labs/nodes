const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

const FIRST_DPID = 500;

console.log(process.cwd())
async function main() {
  fs.rmSync(".openzeppelin/unknown-dpid-alias-registry.json", { force: true });
  fs.rmSync(".openzeppelin/unknown-1337.json", { force: true });

  const DpidAliasRegistry = await ethers.getContractFactory("DpidAliasRegistry");
  console.log("[deployDpidAliasRegistry] Deploying DpidAliasRegistry...");
  const proxy = await upgrades.deployProxy(
    DpidAliasRegistry,
    [
      FIRST_DPID // firstDpid
    ],
    {
      initializer: "__DpidAliasRegistry_init"
    }
  );
  await proxy.deployed();
  console.log("[deployDpidRegistry] DpidAliasRegistry deployed to:", proxy.address);

  fs.renameSync(
    ".openzeppelin/unknown-1337.json",
    ".openzeppelin/unknown-dpid-alias-registry.json",
  );
};

main();