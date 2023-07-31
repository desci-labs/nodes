#! /usr/bin/env bash
#
# Resets application state by dropping blockchain related table data.
# Assumes an .env file neighbour with an authenticated postgres URI present

set -euxo pipefail

# Load psql auth vars to env
POSTGRES_USER=$(grep "POSTGRES_USER" .env | cut -d"=" -f2)
POSTGRES_PASSWORD=$(grep "POSTGRES_PASSWORD" .env | cut -d"=" -f2)

# Try to get ahold of a running postgres container to execute in,
# and if that doesn't exist we start the service from our compose cluster
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

  # docker is a lot slower on MacOS due to running in a Linux VM
  if [ "$(uname)" == "Darwin" ]; then
    sleep 8
  else
    sleep 3
  fi
fi

drop_schema() {
  local schema=$1
  echo "[resetTables] Dropping schema $schema..."
  docker exec $container bash -c \
    "psql -U $POSTGRES_USER -d postgres --echo-all -c 'drop schema if exists $schema cascade;'"

  # Courtesy pause between calls to allow postgres to breathe
  sleep 1
}

drop_tables_in_schema() {
  local schema=$1
  local query="$(table_drop_query $schema)"

  echo "[resetTables] Dropping tables in $schema..."

  # The reason we don't drop the schema and recreate it is because
  # the graph puts stuff in the public schema, which if dropped cascades
  # to stored functions, pg extensions, and other important things.
  #
  # So instead we drop tables individually, by using psql to generate
  # drop statement strings that we pipe back into psql
  #
  # The '$query' variable expands even if it's inside single quotes
  # because the heredoc decides.
  #
  # --tuples-only removes all fuzz from psql output, leaving only
  # the tabular results (newline separated strings)
  #
  # --echo-all in the pipe call emits all statements psql receives
  docker exec $container bash -c "psql -U $POSTGRES_USER -d postgres --tuples-only -c \"$query\" | psql -U $POSTGRES_USER -d postgres --echo-all"

  # Courtesy pause between calls to allow postgres to breathe
  sleep 3
}

# Generate drop table statements scoped for a particular schema.
# Heads up: the quotation here is a bit fragile
table_drop_query() {
  local schema=$1
  # Can't indent this, heredoc token needs to be first in a line
  cat <<EOF
select 'drop table if exists \"' || schemaname || '\".\"' || tablename || '\" cascade;'
from pg_tables
where schemaname = '$schema';
EOF
}

# graph node crashes if the schemas are there, even if empty
drop_schema "chain1"
drop_schema "subgraphs"
drop_schema "sgd1"
# we can't drop the public schema since it contains other goodies
drop_tables_in_schema "public"


if [ "$started_by_script" -gt 0 ]; then
  sleep 1
  echo "Killing postgres container..."
  docker stop "$container" > /dev/null
fi

echo "[resetTables] table cleanup done"

