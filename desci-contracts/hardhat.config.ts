require("dotenv").config({ path: __dirname + "/.env" });
import { task } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// this is specified in .env.example, so not required, but if
// you already generated .env, this will prevent deployment failure
const DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.4",
  mocha: {
    timeout: 120000,
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 2,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
      },
    },
    ganache: {
      chainId: 1337,
      saveDeployments: true,
      live: false,
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
      },
    },
    rinkeby: {
      chainId: 4,
      saveDeployments: true,
      providerType: "WebSocketProvider",
      url: "http://eth-rinkeby.alchemyapi.io/v2/X6CiiZczzALlTM2mAIm_cJnpnFWKTu0l",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
          },
    },
    goerli: {
      chainId: 5,
      live: true,
      saveDeployments: true,
      url: "https://eth-goerli.g.alchemy.com/v2/ZeIzCAJyPpRnTtPNSmddHGF-q2yp-2Uy",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
          },
      gasPrice: 35000000000,
    },
    sepoliaDev: {
      chainId: 11155111,
      live: true,
      saveDeployments: true,
      url: "https://eth-sepolia.g.alchemy.com/v2/Dg4eT90opKOFZ7w-YCxVwX9O-sriKn0N",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
          },
      gasPrice: "auto",
    },
    sepoliaProd: {
      chainId: 11155111,
      live: true,
      saveDeployments: true,
      url: "https://eth-sepolia.g.alchemy.com/v2/Dg4eT90opKOFZ7w-YCxVwX9O-sriKn0N",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
          },
      gasPrice: "auto",
    },
    optimism: {
      chainId: 10,
      live: true,
      saveDeployments: true,
      url: "https://reverse-proxy-dev.desci.com/rpc_opt_mainnet",
      accounts: process.env.PRIVATE_KEY
       ? [ process.env.PRIVATE_KEY ]
       : {
           mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
         },
      gasPrice: "auto",
    },
    optimismSepolia: {
      chainId: 11155420,
      live: true,
      saveDeployments: true,
      url: "https://opt-sepolia.g.alchemy.com/v2/vr-m5h17EAZPdtt88rpvkMy8kwo1-iig", //https://reverse-proxy-dev.desci.com/rpc_opt_sepolia",
      accounts: process.env.PRIVATE_KEY
       ? [ process.env.PRIVATE_KEY ]
       : {
           mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
         },
      gasPrice: "auto",
    },
  },
  react: {
    providers: ["hardhat", "web3modal"],
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  typechain: {
    // outDir: "../desci-dapp/src/hardhat/@types",
    target: "ethers-v5",
  },
};
