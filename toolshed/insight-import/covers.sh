#! /bin/env bash

coverCarDir=local-data/covers
mkdir -p $coverCarDir

find local-data/publications -name cover.jpeg | while read -r cover; do
  echo "📔 Publication $(grep -Eo '[0-9]+' <<< "$cover")"
  cid=$(ipfs add --quieter --cid-version=1 "$cover")
  echo "- Cover CID: $cid"
  echo "- Exporting DAG to $coverCarDir/$cid.car..."
  ipfs dag export "$cid" > "$coverCarDir/$cid.car" 2> /dev/null

  echo "- Writing to metadata file: coverImage = $cid"
  metadataFile=$(dirname "$cover")/metadata.json
  json=$(cat "$metadataFile")
  jq ".coverImage = \"$cid\"" <<<"$json" > "$metadataFile"
  echo "- Done!"
done

echo "🏁 All done! Check $coverCarDir and see README for remote ingestion."
