# dPID alias registry scripts
These scripts are used to interact with the dPID alias registry contracts. There are two deployments, `dev` and `prod`, which correspond to the environment for the previous dPID token contract and registry. Both of these envionments currently live on Optimism Sepolia.

The contract is `pausable`, and deployed in a paused state. For dPID minting not to revert, the contracts need to be unpaused before they are fully operational. Meanwhile, the owner can perform imports/updates of legacy dPID entries.

The contract is `ownable`, and the owner is initially the `PRIVATE_KEY` used to configure the deployment script. Note this `PRIVATE_KEY` variable isn't directly referred to in the scripts, but is known to hardhat from `hardhat.config.ts`.

Run the scripts using this pattern, where `--network` pulls the required information from the hardhat config:

```shell
ARG1=ble ARG2=blu npx hardhat run --network optimismSepolia scripts/alias-registry/xyz.mjs
```

## Scripts
These scripts are used to interact with the alias registry contracts. More detailed documentation is available in the script files.

### `migrateToAliasRegistry.mjs`
Deploys a new dPID alias registry, populating the legacy entries mapping with data from the dPID API. After import, it validates the information in the contract against the data from the dPID API. It saves a log file in `migration-data`, showing the deployed address and each imported dPID.

Arguments:
- `ENV`, selects which dPID API it should use for migration data. Either `dev` or `prod`.
- `PRIVATE_KEY`, makes the deployments, is set as contract owner, and makes import transactions.

### `syncAliasRegistryMigration.mjs`
For a given alias registry address, pulls the dPID API data and validates the existence and history of each dPID, importing / updating the legacy entires as needed. This can be run multiple times, as it only concerns itself with deltas and is idempotent if nothing has changed.

Arguments:
- `ENV`, selects which dPID API it should use for migration data. Either `dev` or `prod`. If this is set to anything else than the env used to populate the contract initially, it'll likely permanently break the contract.
- `PRIVATE_KEY`, makes import transactions (needs to be owner).
- `REGISTRY_ADDRESS`, select which contract to sync (see artifacts in `.openzeppelin` or consult the migration data).

### `activateAliasRegistry.mjs`
Sets the first dPID (i.e., next available integer) and unpauses the contract, leaving it open for external callers to mint identifiers.

Arguments:
- `PRIVATE_KEY`, makes the transactions (needs to be owner).
- `NEXT_DPID`, set the next available dPID. This should correspond to the last legacy dPID, plus one.
- `REGISTRY_ADDRESS`, select which contract to activate (see artifacts in `.openzeppelin` or consult the migration data).

### `deployDpidAliasRegistry.js`
This script is only used for deploying to the local testchain, as part of the monorepo `dockerDev.sh` script.
