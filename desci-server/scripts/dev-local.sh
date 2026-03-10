#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
NODES_DIR="$(dirname "$SERVER_DIR")"

cd "$SERVER_DIR"

echo "=== DeSci Server — Local Dev Setup ==="
echo ""

# 1. Start Postgres, Redis, and IPFS via Docker
echo "[1/6] Starting Postgres, Redis, and IPFS..."
(cd "$NODES_DIR" && docker compose -f docker-compose.dev.yml up -d db_postgres redis ipfs)

echo "[2/6] Waiting for services to be healthy..."
until docker exec db_boilerplate pg_isready -U walter -d postgres > /dev/null 2>&1; do
  sleep 1
done
echo "       Postgres ready."
until docker exec redis_cache redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "       Redis ready."
until docker exec ipfs ipfs id > /dev/null 2>&1; do
  sleep 1
done
echo "       IPFS ready."

# 2. Symlink .env if not present
if [ ! -f "$SERVER_DIR/.env" ]; then
  echo "[3/6] Symlinking .env from parent directory..."
  ln -s "$NODES_DIR/.env" "$SERVER_DIR/.env"
else
  echo "[3/6] .env already exists."
fi

# 3. Fix Sentry CPU profiler binary for current Node ABI
echo "[4/6] Fixing Sentry profiler binary for Node $(node -v)..."
NODE_ABI=$(node -e "console.log(process.versions.modules)")
SENTRY_LIB="$SERVER_DIR/node_modules/@sentry/profiling-node/lib"
TARGET="$SENTRY_LIB/sentry_cpu_profiler-darwin-arm64-${NODE_ABI}.node"
if [ ! -f "$TARGET" ] && [ -d "$SENTRY_LIB" ]; then
  # Find the highest ABI binary available and copy it
  LATEST=$(ls "$SENTRY_LIB"/sentry_cpu_profiler-darwin-arm64-*.node 2>/dev/null | sort -t- -k5 -n | tail -1)
  if [ -n "$LATEST" ]; then
    cp "$LATEST" "$TARGET"
    echo "       Copied $(basename "$LATEST") → $(basename "$TARGET")"
  else
    echo "       Warning: No Sentry profiler binaries found. Skipping."
  fi
else
  echo "       Binary already exists or Sentry not installed."
fi

# 4. Prisma generate + migrate
echo "[5/6] Running Prisma migrations..."
DATABASE_URL=postgresql://walter:white@localhost:5433/boilerplate npx prisma generate --schema=prisma/schema.prisma 2>&1 | tail -1
DATABASE_URL=postgresql://walter:white@localhost:5433/boilerplate npx prisma migrate deploy 2>&1 | tail -3

# 5. Start the server
echo "[6/6] Starting server..."
echo ""
echo "========================================="
echo "  Server:  http://localhost:5420"
echo "  Test UI: http://localhost:5420/test/centralizedData.html"
echo "========================================="
echo ""

export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_URL=redis://localhost:6379
export DATABASE_URL=postgresql://walter:white@localhost:5433/boilerplate
export MIXPANEL_TOKEN=dummy_local_dev
export REVENUECAT_WEBHOOK_SECRET=dummy_local_dev
export REVENUECAT_API_KEY=dummy_local_dev
export NODE_PATH=./dist

# IPFS runs in Docker but server runs natively — point at localhost instead of host.docker.internal
export IPFS_NODE_URL=http://localhost:5001
export PUBLIC_IPFS_RESOLVER=http://localhost:5002
export GUEST_IPFS_NODE_URL=http://localhost:5005
export IPFS_RESOLVER_OVERRIDE=http://localhost:8089/ipfs
export IPFS_READ_ONLY_GATEWAY_SERVER=http://localhost:8089/ipfs

# Compile first, then run
npx tsc 2>&1 | grep -c "error TS" | xargs -I{} echo "       TypeScript compiled ({} type errors, non-blocking)"
exec node ./dist/index.js
