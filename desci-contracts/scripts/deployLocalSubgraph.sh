#! /usr/bin/env bash

set -euo pipefail
trap "catch" ERR
catch() {
    echo "[graph-index] script failed!"
    exit 1
}

FILE=.openzeppelin/unknown-research-object.json

echo "[graph-index] checking if subgraph available at $FILE"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "[graph-index] found deployment file"
else
    echo "[graph-index] no deployment file found, fatal"
    exit 1
fi

TARGET_ADDRESS=$(jq -r '.proxies[-1].address' "$FILE" || echo "")

# File doesn't exist when running outside of docker, empty is fine then
FOUND_ADDRESS=$(grep 0x subgraph/subgraph.yaml | awk '{print $2}' | tr -d '"' || echo "[NONE]")

if [ "$TARGET_ADDRESS" ]; then
    echo "[graph-index] found $TARGET_ADDRESS"
    echo "[graph-index] SUBGRAPH points to $FOUND_ADDRESS"
    echo "[graph-index] make sure the above address points to the expected contract"
    sed "s/0x0/$TARGET_ADDRESS/" subgraph/subgraph.local.yaml >subgraph/subgraph.yaml

    echo "[graph-index] printing subgraph..."
    cat subgraph/subgraph.yaml

    echo "[graph-index] building subgraph..."
    npx hardhat clean
    npx hardhat compile
    yarn graph:build

    echo "[graph-index] running graph:create-docker"
    npm run graph:create-docker

    echo "[graph-index] running graph:deploy-docker"
    npm run graph:deploy-docker

    echo "[graph-index] done!"
else
    echo "[graph-index] no target contract found, fatal"
    exit 1
fi
