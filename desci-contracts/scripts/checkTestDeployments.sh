#!/bin/bash

echo "checking if deployment needed [target=$1]"
# if deployment file doesnt exist, we need to deploy
if [ -f "$1" ]; then
    echo "found deployment file"
else
    echo "no deployment file, deployment needed"
    exit 1
fi

# if deployment file exists, and it has only 1 entry, we don't need to deploy
LINES=$(cat $1 | jq -r '.proxies' | wc -l)
if [ $LINES == 7 ]; then
    echo "no deploy, deployment is cached"
    exit 1
else
    echo "deployment mismatch, deployment needed"
fi