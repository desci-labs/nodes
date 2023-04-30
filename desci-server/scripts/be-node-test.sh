#!/bin/sh
# ls -ltr /app/node_modules/@desci-labs/desci-models/dist

echo "Install bash and execute 'wait-for-it.sh' script"
apt-get add --update bash
./desci-server/scripts/wait-for-it.sh $PG_HOST:5434 --timeout=5 --strict -- echo "postgres up and running"

# npm run migration:run
# npm run seed:run
# chmod -R 777 /app/node_modules/.prisma
# chmod -R 777 /app/node_modules/prisma
# chmod -R 777 /root/ && chown node:node /root/.cache/prisma/master/2920a97877e12e055c1333079b8d19cee7f33826/debian-openssl-1.1.x/libquery-engine # for prisma studio
cd desci-server
yarn run migrate
npx prisma db seed
npm run coverage:destructive