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
    [],
    {
      initializer: "initialize"
    }
  );
  await proxy.deployed();

  let tx = await proxy.setNextDpid(FIRST_DPID);
  await tx.wait();
  tx = await proxy.unpause();
  await tx.wait();

  console.log("[deployDpidRegistry] DpidAliasRegistry deployed to:", proxy.address);

  fs.renameSync(
    ".openzeppelin/unknown-1337.json",
    ".openzeppelin/unknown-dpid-alias-registry.json",
  );
};

main();
