#! /usr/bin/env bash

# Exit on error
# Error on undefined variables
# Error on failure in pipe chains
set -euo pipefail
trap "catch" ERR
catch() {
    echo "[startTestChain] script failed!"
    exit 1
}

# fake private key (junk mnemonic)
## only redeploy a new contract if 1 old entry is in the unknown-research-object.json file
## to force redeploy of fresh contract, delete 2nd entry under proxies in unknown-research-object.json file
scripts/stubHardhatAnalytics.sh

checkTestDeployments() {
    echo "[startTestChain] checking test deployments..."

    if ! scripts/checkTestDeployments.sh ".openzeppelin/unknown-dpid.json"; then
        echo "[startTestChain] deploying dpid contract..."
        yarn deploy:dpid:ganache
    fi

    if ! scripts/checkTestDeployments.sh ".openzeppelin/unknown-research-object.json"; then
        echo "[startTestChain] deploying RO contract..."
        yarn deploy:ganache
    fi

    if ! scripts/checkTestDeployments.sh ".openzeppelin/unknown-dpid-alias-registry.json"; then
        echo "[startTestChain] deploying dpid alias registry..."
        yarn deploy:alias:ganache
    fi
}

waitForPostgres() {
    pg_uri="postgres://walter:white@host.docker.internal:5433/postgres"
    # make sure pg is ready to accept connections
    until pg_isready -h host.docker.internal -p 5433 -U walter; do
        echo "Waiting for postgres at: $pg_uri"
        sleep 2
    done
    # Now able to connect to postgres
}

deployObjectSubgraph() {
    echo "[startTestChain] deploying object subgraph..."
    scripts/deployLocalSubgraph.sh
}

deployDpidSubgraph() {
    echo "[startTestChain] deploying dpid subgraph..."
    scripts/deployLocalDpidSubgraph.sh
}

makeDeployments() {
    checkTestDeployments
    waitForPostgres
    deployObjectSubgraph
    deployDpidSubgraph
}


echo "[startTestChain] starting ganache..."
# Ganache is very spammy with eth_getBlock etc so we filter these out
npx ganache \
  --server.host="0.0.0.0" \
  --chain.networkId="1337" \
  --wallet.mnemonic="${MNEMONIC}" \
  --database.dbPath="/data" \
  | grep --line-buffered -v '^eth_.*$' &

# Wait for ganache process to be findable
until GANACHE_PID=$(pgrep -P $$ ganache); do
  sleep 0.1
done

until curl -s -o /dev/null -w '' http://localhost:8545; do
  sleep 1
done

makeDeployments
wait $GANACHE_PID