#! /usr/bin/env bash

# Test runner script for running both desci-server and nodes-lib tests
# This script orchestrates the test infrastructure and runs tests sequentially

set -e  # Exit on error

cleanup() {
  echo "🧹 cleaning up..."
  cd "$(git rev-parse --show-toplevel)"
  docker compose -f docker-compose.test.yml stop || true
}

logs_or_notice() {
  if [ -n "$GITHUB_ACTIONS" ]; then
    echo "::group::Full compose logs"
    echo "note: sync worker logs are hidden"
    docker compose -f docker-compose.test.yml logs | grep -v "nodes_sync_test_worker"
    echo "::endgroup::"
  else
    echo "🔎 Check logs with 'docker compose -f docker-compose.test.yml logs [container]'"
  fi
}

# shellcheck disable=SC2329
handle_error() {
  echo "💥 test runner failed"
  logs_or_notice
  cleanup
  exit 1
}

trap handle_error ERR

# Cleanup old containers
docker compose -f docker-compose.test.yml down

# 0. Build all images, utilising cache
echo "🔨 Building test cluster images..."
docker compose -f docker-compose.test.yml build

echo "⚒️ Starting test infrastructure..."
# 1. Start infrastructure services, blocking until healthy
docker compose -f docker-compose.test.yml up \
  --remove-orphans \
  --wait \
  --wait-timeout 120 \
  nodes_test_db \
  nodes_test_sync_service \
  nodes_test_ipfs

if [ "$SKIP_SERVER" != "1" ]; then
  # 2. Run desci-server tests
  echo "🤞 Running desci-server tests..."
  if ! docker compose -f docker-compose.test.yml run nodes_backend_test; then
    echo "❌ desci-server tests failed!"
    logs_or_notice
    cleanup
    exit 1
  fi

  echo "✅ desci-server tests passed"
else
  echo "👀 skipping desci-server tests"
fi

if [ "$SKIP_NODES_LIB" != "1" ]; then
  # 3. Bring the backend back up, in server mode
  RUN_SERVER=1 docker compose -f docker-compose.test.yml up \
    --remove-orphans \
    --wait \
    --wait-timeout 600 \
    nodes_backend_test \
    desci_blockchain_ganache \
    ceramic_one_test

  if [ -z "$GITHUB_ACTIONS" ]; then
    CERAMIC_ADMIN_SEED=$(grep "CERAMIC_ADMIN_SEED" .env | cut -d"=" -f2)
  fi

  CERAMIC_ONE_RPC_URL="http://localhost:5101" PRIVATE_KEY="$CERAMIC_ADMIN_SEED" npx --yes @desci-labs/desci-codex-models deploy
  CERAMIC_ONE_RPC_URL="http://localhost:5101" npx --yes @desci-labs/desci-codex-models register

  # 4. Run nodes-lib tests
  echo "🤞 Running nodes-lib tests..."
  if ! RUN_SERVER=1 docker compose -f docker-compose.test.yml run nodes_lib_test; then
    echo "❌ nodes-lib tests failed!"
    logs_or_notice
    cleanup
    exit 1
  fi

  echo "✅ nodes-lib tests passed"
else
  echo "👀 skipping nodes-lib tests"
fi

# 5. Cleanup
cleanup

echo "🎊 All tests passed successfully!"

