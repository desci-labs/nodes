#! /bin/env bash

set -euo pipefail

if ! command -v ipfs > /dev/null; then
  echo '🙅 ipfs is required, please install kubo!'
  exit 1
fi

missingFile=$1
if [ -z "$missingFile" ]; then
  echo "❌ Expected a file path to the output of analyseMissing.sh as arugment"
  exit 1
fi

ARTICLE_DAG="bafybeialgmdqikskc56dhy2xrnio2te23xdzqdm77wtqxpxybr3ys5cpli"

if [ ! -f "$missingFile" ]; then
  echo '❌ Need a file with newline separated "cid pub-id" pairs for articles'
  exit 1
fi

while IFS=" " read -r pubId type cid; do
  if [ ! "$type" = "article" ]; then
    echo "🍃 Skipping non-article CID $cid for pub $pubId"
    continue
  fi

  carPath="local-data/cars/$cid.car"
  if [ -f "$carPath" ]; then
    echo "🚗 Found existing CAR at $carPath, this will be clobbered!"
  fi

  url="https://$ARTICLE_DAG.ipfs.dweb.link/ij-articles/$pubId/1/article.pdf"
  # These files are unchunked/raw binary DAGS, so the CIDs do not match the metadata files.
  # We compute the default chunked DAG, export this to a car, and we get the correct CID.
  curl --silent "$url" \
    | ipfs add --quieter --cid-version=1 \
    | xargs ipfs dag export --progress=false \
    > "$carPath"
  
  if ! car verify "$carPath"; then
    echo "💥 CAR failed verification for pub $pubId, bad download?"
    rm -f "$carPath"
  elif [ ! "$(car root "$carPath")" = "$cid" ]; then
    echo "😬 CAR root and CID isn't matching for pub $pubId, failed to recreate expected CID"
    rm -f "$carPath"
  else
    echo "🚗 Article $cid reconstructed for pub $pubId"
  fi
done < missing.txt
