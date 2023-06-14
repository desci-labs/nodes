#!/bin/bash


(trap 'kill 0' SIGINT; npx hardhat node --network hardhat --no-deploy &)

sleep 2

npx gsn start &

sleep 5

npx hardhat test

killall node

echo "Done 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥"