#! /bin/env bash

set -euo pipefail

carPath=$1
pod=$2

tmpPath=/tmp/cars_to_import.tar.gz

if [ -z "$carPath" ] || [ -z "$pod" ]; then
  echo '❌ Expected path to cars directory and pod name as arguments'
  exit 1
fi

echo "📥 Packing cars for transfer..."
find "$carPath" -name "*.car" -print0 \
  | tar --null -T - -czf $tmpPath

echo "💌 Yeeting the lot to pod $pod..."
kubectl cp $tmpPath "$pod:$tmpPath"

echo "📤 Importing cars on $pod..."
kubectl exec -it "$pod" -- bash -c \
  "tar xzf $tmpPath --to-command='ipfs dag import --stats'"

echo "🎊 Happy clappy success, probably! Probably smart to check the logs though."
