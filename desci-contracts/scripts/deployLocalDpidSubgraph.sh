#! /usr/bin/env bash

# INFO:
# This script only meant to be invoked from startTestChain, in the blockchain
# container startup sequence.

set -euo pipefail
trap "catch" ERR
CTX="[graph::dpid]"
catch() {
    echo "$CTX script failed!"
    exit 1
}

FILE=.openzeppelin/unknown-dpid.json

echo "$CTX checking if contract info available at $FILE..."
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "$CTX found deployment file"
else
    echo "$CTX no deployment file found, fatal"
    exit 1
fi

TARGET_ADDRESS=$(jq -r '.proxies[-1].address' "$FILE" || echo "")
if [ ! "$TARGET_ADDRESS" ]; then
  echo "$CTX no target contract found, fatal"
  exit 1
fi

PKG_PATH="/dpid-subgraph"
if [ ! -d "$PKG_PATH/node_modules" ]; then
  git clone --depth=1 https://github.com/desci-labs/dpid-subgraph.git "$PKG_PATH"
  yarn --cwd "$PKG_PATH"
fi

echo "$CTX contract deployed at $TARGET_ADDRESS"
echo "$CTX make sure this is the expected address"

# Convert default sepolia config to local config
sed -i "s/0x[0-9a-zA-Z]*/$TARGET_ADDRESS/" $PKG_PATH/subgraph.yaml
sed -i "s/sepolia/ganache/" $PKG_PATH/subgraph.yaml
sed -i "/startBlock/d" $PKG_PATH/subgraph.yaml

echo "$CTX printing subgraph:"
cat $PKG_PATH/subgraph.yaml

# Fix paths in npm scripts
echo "$CTX fixing localhost paths in graph scripts..."
sed -i "s/localhost/host.docker.internal/g" $PKG_PATH/package.json

echo "$CTX building subgraph..."
yarn --cwd "$PKG_PATH" run codegen
yarn --cwd "$PKG_PATH" run create-local
yarn --cwd "$PKG_PATH" run deploy-local -l v0.0.1

echo "$CTX done!"
