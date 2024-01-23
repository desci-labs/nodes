#!/bin/sh
echo "Install bash and execute 'wait-for-it.sh' script"
apt-get add --update bash

./desci-repo/scripts/wait-for-it.sh $PG_HOST:5432 --timeout=5 --strict -- echo "postgres up and running"

# npm run migration:run
# npm run seed:run
chmod -R 777 /app/node_modules/.prisma
chmod -R 777 /app/node_modules/prisma
# chmod -R 777 /root/ && chown node:node /root/.cache/prisma/master/2920a97877e12e055c1333079b8d19cee7f33826/debian-openssl-1.1.x/libquery-engine # for prisma studio
cd desci-repo
npm run db:sync
yarn dev
