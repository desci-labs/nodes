#! /usr/bin/env bash
# Checks if there is a stub for hardhat analytics, and creates it otherwise

set -euo pipefail
trap "catch" ERR
catch() {
  echo "[stubHardhatAnalytics] script failed!"
  exit 1
}

STUB='{"analytics": {"clientId": "47c226ca-85f1-4b1d-8e2e-bd9886703144"}}'
FILE="$HOME/.local/share/hardhat-nodejs/analytics.json"

echo "[stubHardhatAnalytics] checking..."
if [ ! -f "$FILE" ];
then
  echo "[stubHardhatAnalytics] not present, writing"
  echo "$STUB" > "$FILE"
else
  echo "[stubHardhatAnalytics] present, doing nothing"
fi
