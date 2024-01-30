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
  exit 1
}

# Assert running from repo root
if [[ ! -f .env ]]; then
  echo "$CTX Must run from repo root, aborting!"
  exit 1
fi

# Assert desci-codex repo available
CODEX_REPO_PATH=$(grep "CODEX_REPO_PATH" .env | cut -d"=" -f2)
if [[ -z "$CODEX_REPO_PATH" ]]; then
  echo "$CTX CODEX_REPO_PATH not set in .env, aborting!"
  exit 1
else
  echo "$CTX Found codex repo path: $CODEX_REPO_PATH"
fi

# Assert ceramic service is running
RUNNING_SERVICES=$(docker compose --project-name desci ps --services)
if ! grep -q ceramic <<<"$RUNNING_SERVICES"; then
  echo "$CTX the ceramic compose service doesn't seem to be running, aborting!"
  exit 1
fi

# Setup desci-codex and deploy composites
pushd "$CODEX_REPO_PATH"
if [[ ! -d "node_modules" ]]; then
  echo "$CTX installing deps desci-codex..."
  npm ci
fi

echo "$CTX deploying composites..."
npm run --workspace packages/composedb deployComposites
popd

echo "$CTX composites deployed! Copying composite runtime definition to local-data/ceramic..."
cp \
  "$CODEX_REPO_PATH/packages/composedb/src/__generated__/definition.js" \
  local-data/ceramic/definition.js

echo "$CTX Done! Re-run this script if local state is cleaned."
