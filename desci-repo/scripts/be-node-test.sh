#!/bin/sh
# ls -ltr /app/node_modules/@desci-labs/desci-models/dist

echo "Install bash and execute 'wait-for-it.sh' script"
apt-get add --update bash
./desci-repo/scripts/wait-for-it.sh $PG_HOST:5434 --timeout=5 --strict -- echo "postgres up and running"

mkdir -p /app/desci-repo/repo-tmp
chmod -R 777 /app/desci-repo/repo-tmp
cd desci-repo
yarn
yarn build
yarn start
