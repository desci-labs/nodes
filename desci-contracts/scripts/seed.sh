#! /usr/bin/env bash

# Name of contract (human readable)
CONTRACT_NAME=$1
# Contract deployment file
FILE=".openzeppelin/$2"
# Yarn command for deploying, e.g. "deploy:dpid:ganache"
YARN_CMD=$3

set -euo pipefail
trap catch ERR SIGTERM SIGINT
catch() {
  echo "[seed:$CONTRACT_NAME] script failed!"
  trap - SIGTERM
  kill 0
}

ROOT=$(git rev-parse --show-toplevel)
MNEMONIC=$(grep "MNEMONIC" "$ROOT/.env" | cut -d'=' -f 2-)
echo "[seed:$CONTRACT_NAME] got mnemonic: $MNEMONIC"

check() {
  while [ ! -f "$FILE" ]; do
    echo "[seed:$CONTRACT_NAME] checking for deployment..."
    sleep 5
  done

  echo "[seed:$CONTRACT_NAME] deployment found, killing ganache..."
  pkill --full "npm exec ganache"
}

waitAndDeploy() {
  echo "[seed:$CONTRACT_NAME] waiting for ganache..."
  sleep 10
  MNEMONIC="$MNEMONIC" yarn "$YARN_CMD"
}

echo "[seed:$CONTRACT_NAME] checking if ABI seed needed for contract"
if [ -f "$FILE" ]; then
  echo "[seed:$CONTRACT_NAME] found deployment file, doing nothing"
else
  echo "[seed:$CONTRACT_NAME] no deployment file, running ganache and deploying..."
  mkdir -p ../local-data/ganache
  waitAndDeploy &
  echo "[seed:$CONTRACT_NAME] waiting until contract is deployed"
  check &
  npx ganache \
    --server.host="0.0.0.0" \
    --database.dbPath="../local-data/ganache" \
    --chain.networkId="1337" \
    --wallet.mnemonic="$MNEMONIC" \
    --logging.quiet="true"
fi

