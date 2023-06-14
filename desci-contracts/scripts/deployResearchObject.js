const { ethers, upgrades } = require("hardhat");

const dpidRegistry = require("../.openzeppelin/unknown-dpid.json");
import localForwarder from "../build/gsn/Forwarder.json";
import deployedNetworks from "../config/gsn-networks.json";

async function main() {
  const ResearchObject = await ethers.getContractFactory("ResearchObject");
  console.log("Deploying ResearchObject...");
  let forwarder;
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
        (await ethers.provider
          .getCode(forwarder)
          .then((code) => code.length)) === 2
      ) {
        throw new Error(
          'GSN is not running. You may use "yarn node:start && yarn deploy-gsn" to launch Hardhat and GSN.'
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

      //** Deploy custom paymaster here and connect it to relayer & forwarder
      const Paymaster = await ethers.getContractFactory("Paymaster");
      let paymaster = await Paymaster.deploy();
      console.log("Deploying paymaster....");
      await paymaster.deployed();
      console.log("Paymaster deployed at: ", paymaster.address);

      console.log("running setTrustedForwarder on paymaster", forwarder);
      await paymaster.setTrustedForwarder(forwarder);

      console.log("running setRelayHub on relayer", relayerHub);
      await paymaster.setRelayHub(relayerHub);

      console.log("funding paymaster....");
      const tx = await paymaster.deposit({
        from: deployer.address,
        value: utils.parseEther("0.5"),
      });
      await tx.wait();
      console.log("Paymaster funded ✅", tx.hash);
    } else {
      forwarder = localForwarder.address;
    }

  const proxy = await upgrades.deployProxy(ResearchObject, [
    dpidRegistry.proxies[0].address,
    forwarder
  ]);
  await proxy.deployed();

  console.log("ResearchObject deployed to:", proxy.address);
}

main();
