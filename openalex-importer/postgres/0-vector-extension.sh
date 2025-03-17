#!/bin/bash
set -e

echo "In create extension"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname="$POSTGRES_DB" <<EOFSQL
CREATE EXTENSION vector;
EOFSQL