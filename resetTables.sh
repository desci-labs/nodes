#! /usr/bin/env bash
#
# Resets application state by dropping blockchain related table data.
# Assumes an .env file neighbour with an authenticated postgres URI present

set -euo pipefail

# Load psql auth vars to env
source <(grep -e "POSTGRES_USER" -e "POSTGRES_PASSWORD" .env)

DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5433/postgres"

drop_schema() {
  local SCHEMA=$1
  echo "[resetTables] Dropping and recreating $SCHEMA..."
  psql -c "drop schema if exists $SCHEMA cascade" $DATABASE_URL
}

if ! docker ps | grep -q db_boilerplate; then
  echo "[resetTables] WARN: postgres container isn't running, skipping!"
  echo "[resetTables] re-run with cluster up to clean chain and subgraph tables"
  exit
fi

drop_schema "chain1"
drop_schema "subgraphs"
drop_schema "sgd1"

echo "[resetTables] table cleanup done"

