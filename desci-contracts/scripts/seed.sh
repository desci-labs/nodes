#! /usr/bin/env bash

# Name of contract (human readable)
CONTRACT_NAME=$1
# Contract deployment file
FILE=".openzeppelin/$2"
# Yarn command for deploying, e.g. "deploy:dpid:ganache"
YARN_CMD=$3

set -euo pipefail
trap catch ERR
catch() {
  echo "[seed:$CONTRACT_NAME] script failed!"
  exit 1
}

trap _term SIGTERM SIGINT
_term() {
  echo "[seed:$CONTRACT_NAME] caught signal!"
  RUNNING=false
  kill -s SIGTERM $child
}

ROOT=$(git rev-parse --show-toplevel)
MNEMONIC=$(grep "MNEMONIC" "$ROOT/.env" | cut -d'=' -f 2-)
echo "[seed:$CONTRACT_NAME] got mnemonic: $MNEMONIC"
RUNNING=true

check() {
  while $RUNNING; do
    test $? -gt 128 && break;
    echo "[seed:$CONTRACT_NAME] checking..."
    if [ -f "$FILE" ]; then
      echo "[seed:$CONTRACT_NAME] killing ganache..."
      if ps aux | grep "npm exec ganache" | grep -v "grep" | awk '{print $2}' | xargs kill; then
        echo "[seed:$CONTRACT_NAME] done"
      else
        echo "[seed:$CONTRACT_NAME] couldn't find the ganache process"
      fi
      exit
    fi
    sleep 5
  done
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
  waitAndDeploy &
  mkdir -p ../local-data/ganache
  sudo chown -R $(whoami) ../local-data/ganache
  echo "[seed:$CONTRACT_NAME] waiting until contract is deployed"
  check &
  child=$!
  npx ganache \
    --server.host="0.0.0.0" \
    --database.dbPath="../local-data/ganache" \
    --chain.networkId="1337" \
    --wallet.mnemonic="$MNEMONIC" \
    --logging.quiet="true"
  wait "$child"
fi

