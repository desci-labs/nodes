#! /bin/env bash

carPath=$1
pod=$2

tmpPath=/tmp/cars_to_import.tar.gz

if [ -z "$1" ] || [ -z "$2" ]; then
  echo '❌ Expected args: path to car dir (1), target pod name (2)'
  exit 1
fi

set -euo pipefail

echo "📥 Packing cars for transfer..."
find "$carPath" -name "*.car" -print0 \
  | tar --null -T - -czf $tmpPath

echo "💌 Yeeting the lot to pod $pod..."
kubectl cp $tmpPath "$pod:$tmpPath"

if ! kubectl exec -it "$pod" -- tar --version | grep -q "GNU"; then
  echo "✨ Installing GNU tar on pod..."
  apk add tar
fi

echo "📤 Importing cars on $pod..."
kubectl exec -it "$pod" -- bash -c \
  "tar xzf $tmpPath --to-command='ipfs dag import --stats'"

echo "🎊 Happy clappy success, probably!"
