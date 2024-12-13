#! /bin/env bash

set -euo pipefail

tmpdir=/tmp/ij_metadata/IJMetadata
mkdir -p $tmpdir

for f in local-data/publications/*/metadata.json; do
    dir_name=$(basename $(dirname "$f"))
    cp "$f" "$tmpdir/${dir_name}-metadata.json"
done

npx --yes quicktype \
  --prefer-types \
  "$(dirname $tmpdir)" \
  -o src/ijTypes.ts

rm -r "$(dirname $tmpdir)"
