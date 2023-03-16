# Running Locally
======================
# Step 1: Start local chain (Only if making contract changes locally, otherwise you can point to Kovan testnet)
========================================================
# Run local Optimism Docker (network: optimistic)
Make sure local Docker Desktop app is running
Instructions: https://community.optimism.io/docs/developers/build/dev-node/
```
# the command to start (in the optimism/ops folder)
docker-compose -f docker-compose-nobuild.yml up

# in separate tab (in the optimism/ops folder)
scripts/wait-for-sequencer.sh && echo "System is ready to accept transactions"
```

L1 (Ethereum) node: http://localhost:9545
L2 (Optimism) node: http://localhost:8545

# Step 2: Deploy new version of contracts locally
```
npx hardhat run scripts/deployResearchObject.js --network ganache

## upgrading

npx hardhat run scripts/upgradeResearchObject.js --network ganache
```

Contract addresses are stored in .openzeppelin/unknown-CHAINID.json (or mainnet.json for known chains)
ABIs are stored in artifacts/ResearchObject.sol/ResearchObject.json

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
```
npx hardhat typechain
```
You should see TypeScript support for the contracts (i.e. ResearchObject, etc) for Hardhat Tests and anywhere the contract is called (desci-dapp, desci-server, contract tests)
To support IDE autocompletion of smart contract calls from TypeScript we use TypeChain to generate types
These types are shipped to desci-contracts/typechain-types as specified in hardhat.config.ts

TODO: desci-dapp expects these types in desci-dapp/src/hardhat/@types. You may need to manually copy these types to desci-dapp and desci-server, or wherever the types are used