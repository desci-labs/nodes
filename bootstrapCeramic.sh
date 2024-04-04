#! /usr/bin/env bash

# This script will try to find the `desci-codex` repo and run the
# model deployments. This yields a runtime definition file, which is
# necessary to instantiate the composeDB client used for publishing.
#
# This needs to be re-run when local-data is cleaned, as the models will
# get new streamIDs, and hence the runtime definition file is changed.
#
# There is no damage trying to run this multiple times in a row; it's
# idempotent.

CTX="[bootstrapCeramic.sh]"

set -euo pipefail
trap catch ERR
catch() {
  echo "$CTX script failed"
  if [ "$WAS_RUNNING" -eq "0" ]; then
    docker compose --project-name desci down
  fi
  exit 1
}

# Assert running from repo root
if [[ ! -f .env ]]; then
  echo "$CTX Must run from repo root, aborting!"
  exit 1
fi

# Make sure we have the admin seed in env so modelIDs make sense
CERAMIC_ADMIN_SEED=$(grep "CERAMIC_ADMIN_SEED" .env | cut -d"=" -f2)
if [[ -z "$CERAMIC_ADMIN_SEED" ]]; then
  echo "$CTX CERAMIC_ADMIN_SEED must be set in env, as the modelID's aren't deterministic otherwise."
  exit 1
fi

# Check if ceramic service is already running
WAS_RUNNING=0
RUNNING_SERVICES=$(docker compose --project-name desci ps --services)
if ! grep -q ceramic <<<"$RUNNING_SERVICES"; then
  echo "$CTX the ceramic compose service doesn't seem to be running, starting..."
  docker compose \
    -f docker-compose.dev.yml \
    -f docker-compose.yml \
    --project-name desci \
    up ceramic \
    --detach
  sleep 5
else
  echo "$CTX Ceramic service already running, won't touch compose services..."
  WAS_RUNNING=1
fi

echo "$CTX Downloading the runtime definition file for the composeDB models..."
curl -L --output .composedbRuntimeDefinition.json \
  https://raw.githubusercontent.com/desci-labs/desci-codex/main/packages/composedb/src/__generated__/definition.json

echo "$CTX Deploying composites to ceramic node..."
npx --yes @composedb/cli composite:deploy \
  .composedbRuntimeDefinition.json \
  --ceramic-url="http://localhost:7007" \
  --did-private-key="$CERAMIC_ADMIN_SEED"

sleep 5
echo "$CTX Deployment all good, probably!"

if [ "$WAS_RUNNING" -eq "0" ]; then
  echo "$CTX Shutting down ceramic service..."
  docker compose --project-name desci down
else
  echo "$CTX Leaving compose services up as they were already running when we started."
fi 

echo "$CTX Done! You need to run me again if local data is wiped."
