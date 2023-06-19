#!/bin/bash

echo "[checkTestDeployments] checking if deployment needed [target=$1]"
# if deployment file doesnt exist, we need to deploy
if [ -f "$1" ]; then
    echo "[checkTestDeployments] found deployment file"
else
    echo "[checkTestDeployments] no deployment file, deployment needed"
    exit
fi

# if deployment file exists, and it has only 1 entry, we don't need to deploy
LINES=$(cat $1 | jq -r '.proxies' | wc -l)
if [ $LINES == 7 ]; then
    echo "[checkTestDeployments] no deploy, deployment is cached"
    exit
else
    echo "[checkTestDeployments] deployment mismatch, deployment needed"
fi