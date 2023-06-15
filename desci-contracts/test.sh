#!/bin/bash

MNEMONIC=$(grep MNEMONIC .env | cut -d '=' -f 2-)
echo "GOT MNEMONIC $MNEMONIC"

##! remove script to start ganache after migrating from ganache-cli
(trap 'kill 0' SIGINT;npx ganache --database.dbPath="./ganache-data" --chain.networkId="111" --wallet.mnemonic="$MNEMONIC" --logging.quiet="true" &)

sleep 2

npx gsn start &

sleep 7

npx hardhat test --network ganache

sleep 2

killall node

echo "Done 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥"