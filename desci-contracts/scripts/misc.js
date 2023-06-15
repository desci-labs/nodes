const { ethers, upgrades } = require("hardhat");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "http://localhost:8545"
  );
  console.log("block", await provider.getBlockNumber());
  console.log(
    "bal",
    await provider.getBalance("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
  );
}

main();
