const { ethers, upgrades } = require("hardhat");
const dpidRegistry = require("../.openzeppelin/unknown-dpid.json");
const researchObject = require("../.openzeppelin/unknown-research-object.json");
import localForwarder from "../build/gsn/Forwarder.json";

const fs = require("fs");

async function main() {
  const ResearchObject = await ethers.getContractFactory("ResearchObject");
  console.log("Upgrading ResearchObject...");
  fs.writeFileSync(
    ".openzeppelin/unknown-1337.json",
    JSON.stringify(researchObject)
  );


  if (network.name !== "localhost" || !chainId.toString().match(/1337/)) {
    if (!deployedNetwork) {
      throw new Error(`GSN not deployed on network ${chainId}`);
    }
    forwarder =
      deployedNetwork.contracts &&
      deployedNetwork.contracts.Forwarder &&
      deployedNetwork.contracts.Forwarder.address;
    if (!forwarder) {
      throw new Error(`No Forwarder address on network ${chainId}`);
    }
    console.log("Forwarder ", forwarder);

    // sanity check: the build/gsn was created on the currently running node.
    console.log("Running sanity check on forwarder");
    if (
      (await ethers.provider.getCode(forwarder).then((code) => code.length)) ===
      2
    ) {
      throw new Error(
        'GSN is not running. You may use "npx gsn start" to launch Hardhat and GSN.'
      );
    }

    // validate relayerhub
    relayerHub =
      deployedNetwork.contracts &&
      deployedNetwork.contracts.RelayHub &&
      deployedNetwork.contracts.RelayHub.address;

    if (!relayerHub) {
      throw new Error(`No RelayHub address on network ${chainId}`);
    }
  } else {
    forwarder = localForwarder.address;
  }

  // throw Error("n");
  const upgraded = await upgrades.upgradeProxy(
    researchObject.proxies[0].address,
    ResearchObject,
    [dpidRegistry.proxies[0].address, forwarder]
  );
  fs.rmSync(".openzeppelin/unknown-1337.json");
  console.log("ResearchObject upgraded", upgraded);
}

main();
