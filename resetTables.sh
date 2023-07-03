#! /usr/bin/env bash
#
# Resets application state by dropping blockchain related table data.
# Assumes an .env file neighbour with an authenticated postgres URI present

set -euo pipefail

# Load psql auth vars to env
source <(grep -e "POSTGRES_USER" -e "POSTGRES_PASSWORD" .env)
#DATABASE_URL="postgresql://$PG_AUTH@localhost:$PG_PORT/postgres"
started_by_script=0
if ! container=$(docker ps | grep db_boilerplate | cut -d' ' -f1); then
  started_by_script=1
  echo "Postgres container not alive, starting..."
  container=$(docker compose \
    --file docker-compose.yml \
    --file docker-compose.dev.yml \
    --compatibility \
    run \
    --no-deps \
    --detach \
    db_postgres)

  sleep 3
fi


drop_schema() {
  local SCHEMA=$1
  echo "[resetTables] Dropping and recreating $SCHEMA..."
  docker exec $container bash -c \
    "psql -U $POSTGRES_USER -d postgres -c 'drop schema if exists $SCHEMA cascade'"
  sleep 1
}

drop_schema "chain1"
drop_schema "subgraphs"
drop_schema "sgd1"

if [ "$started_by_script" -gt 0 ]; then
  sleep 1
  echo "Killing postgres container..."
  docker stop "$container" > /dev/null
fi

echo "[resetTables] table cleanup done"

