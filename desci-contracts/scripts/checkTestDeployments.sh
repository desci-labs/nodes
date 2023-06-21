#! /usr/bin/env bash
#
# Checks if deployment is needed given a contract manifest path as $1
# Non-zero exit code if deployment is required

set -euo pipefail
trap "catch" ERR
catch() {
  echo "[checkTestDeployments] script failed!"
  exit 1
}

TARGET="$1"

echo "[checkTestDeployments] checking [target=$TARGET]..."

# if deployment file doesnt exist, we need to deploy
if [ -f "$TARGET" ]; then
    echo "[checkTestDeployments] found deployment file"
else
    echo "[checkTestDeployments] no deployment file, deployment needed"
    exit 1
fi

# if deployment file exists, and it has only 1 entry, we don't need to deploy
LINES=$(jq -r '.proxies' "$TARGET" | wc -l)
if [ "$LINES" = 7 ]; then
    echo "[checkTestDeployments] no deploy, deployment is cached"
else
    echo "[checkTestDeployments] deployment mismatch, deployment needed"
    exit 1
fi
