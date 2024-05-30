const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

const FIRST_DPID = process.env.FIRST_DPID;
if (FIRST_DPID === undefined) {
  throw new Error("FIRST_DPID unset");
};

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
      initializer: "initialize"
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
