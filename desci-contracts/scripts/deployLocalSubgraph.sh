#!/bin/bash

FILE=.openzeppelin/unknown-research-object.json

echo "graph-index: checking if subgraph available at $FILE"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "graph-index: found deployment file"
else
    echo "graph-index: no deployment file"
    exit 1
fi


TARGET_ADDRESS=$(cat $FILE | jq -r '.proxies[-1].address')
FOUND_ADDRESS=$(cat subgraph/subgraph.yaml | grep 0x | awk '{print $2}' | tr -d '"')

if [ $TARGET_ADDRESS ]; then
    echo "graph-index: found $TARGET_ADDRESS"
    echo "graph-index: SUBGRAPH points to $FOUND_ADDRESS"
    echo "graph-index: make sure the above address points to the expected contract"
    sed "s/0x0/$TARGET_ADDRESS/" subgraph/subgraph.local.yaml > subgraph/subgraph.yaml

    cat subgraph/subgraph.yaml

    npx hardhat clean && npx hardhat compile

    yarn graph:build

    echo "graph-index: graph:create-docker"
    npm run graph:create-docker

    echo "graph-index: graph:deploy-docker"
    npm run graph:deploy-docker

    echo "graph-index: done"
else
    echo "graph-index: no target contract found"
fi