#! /bin/env bash

set -euo pipefail

logfile=$1

if [ -z "$logfile" ]; then
  echo "❌ expected a sync log file as \$1"
  exit 1
fi

grep ERR "$logfile" | cut -d" " -f2 | while read -r cid; do
  grep "$cid" local-data/publications/*/metadata.json \
    | sed -E 's|^.*/([0-9]*)/metadata.json|\1|' \
    | sed -E 's| +| |' \
    | tr -d '":,{}'
done
