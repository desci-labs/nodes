# DeSci Labs smart contract suite
This package holds the contracts backing DeSci Nodes and the dPID protocol.

# Running Locally

*Note: all of the steps below are performed automatically as part of the local development cluster setup in the monorepo root, `dockerDev.sh`.*

# Step 1: Start local chain

In the main docker compose dev cluster we use Ganache, and some deployment scripts may assume keys and addresses based off those assumptions.

Ethereum node: http://localhost:8545

# Step 2: Deploy new version of contracts locally

```
npx hardhat run scripts/deployResearchObject.js --network ganache

## upgrading

npx hardhat run scripts/upgradeResearchObject.js --network ganache
```

Contract addresses are stored in `.openzeppelin/unknown-CHAINID.json` (or `mainnet.json` for known chains)
ABIs are stored in `artifacts/ResearchObject.sol/ResearchObject.json`.

# Step 3 (Optional): Deploy to staging (running our own private test chain)

```
# ensure logged into AWS using aws-cli
yarn docker:build
yarn docker:push
```

# Tip: run tests

npx hardhat test

# Tip: flatten for remix dev

npx hardhat flatten

# TypeScript / TypeChain

To compile contracts and generate typechain outputs, run the `build` script:

```shell
npm run build
```

You should see TypeScript support for the contracts (i.e. ResearchObject & dPID Registry) for Hardhat Tests and anywhere the contract is called (desci-dapp, desci-server, contract tests)
To support IDE autocompletion of smart contract calls from TypeScript we use TypeChain to generate types
These types are shipped to desci-contracts/typechain-types as specified in hardhat.config.ts.

Because the local deployment files are only present locally, building the [npm package](https://www.npmjs.com/package/@desci-labs/desci-contracts) is done with a separate command:

```shell
npm run makePackage
```

# Migrating from goerli to local and sepolia

```
# Perform DPID migration to LOCALHOST (ganache)
npx hardhat run scripts/migrateToNewContract.js --network ganache

# Deploy to SEPOLIA. Ensure PRIVATE_KEY is set with wallet containing enough sepolia eth
npx hardhat run scripts/migrateToNewContract.js --network sepoliaDev
```
