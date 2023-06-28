#! /usr/bin/env bash

set -euo pipefail
trap "catch" ERR
catch() {
    echo "deployLocalSubgraph: script failed!"
    exit 1
}

FILE=.openzeppelin/unknown-research-object.json

echo "[graph-index] checking if subgraph available at $FILE"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "[graph-index] found deployment file"
else
    echo "[graph-index] no deployment file"
    exit 1
fi

TARGET_ADDRESS=$(jq -r '.proxies[-1].address' "$FILE" || echo "")

# File doesn't exist when running outside of docker, empty is fine then
FOUND_ADDRESS=$(grep 0x subgraph/subgraph.yaml | awk '{print $2}' | tr -d '"' || echo "[NONE]")

waitForNodeAdminServer() {
    until [ \
        "$(curl -s -w '%{http_code}' -o /dev/null "http://host.docker.internal:8020")" \
        -eq 405 ]; 
    do
        echo "[waitForNodeAdminServer]: Waiting for http://host.docker.internal:8020"
        sleep 5
    done

    # until $(curl --output /dev/null --silent --fail http://host.docker.internal:8020); do
    #     echo "[deployLocalSubgraph] waiting for http://host.docker.internal:8020 to start"
    #     sleep 5
    # done
}

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

    waitForNodeAdminServer

    echo "[graph-index] graph:create-docker"
    npm run graph:create-docker

    echo "[graph-index] graph:deploy-docker"
    npm run graph:deploy-docker

    echo "[graph-index] done"
else
    echo "[graph-index] no target contract found"
    exit 1
fi
