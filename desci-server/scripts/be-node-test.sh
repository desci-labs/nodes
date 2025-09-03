#!/bin/sh
# ls -ltr /app/node_modules/@desci-labs/desci-models/dist

# echo "Install bash and execute 'wait-for-it.sh' script"
# apt-get add --update bash
# ./desci-server/scripts/wait-for-it.sh $PG_HOST:5434 --timeout=5 --strict -- echo "postgres up and running"

# npm run migration:run
# npm run seed:run
# chmod -R 777 /app/node_modules/.prisma
# chmod -R 777 /app/node_modules/prisma
# chmod -R 777 /root/ && chown node:node /root/.cache/prisma/master/2920a97877e12e055c1333079b8d19cee7f33826/debian-openssl-1.1.x/libquery-engine # for prisma studio
# mkdir -p /app/desci-server/repo-tmp
# chmod -R 777 /app/desci-server/repo-tmp
cd desci-server || exit 1
yarn run migrate
npx prisma db seed

# update prisma client in desci-repo in case it not initialized properly
# cp node_modules/.prisma/*/* ../desci-repo/node_modules/.prisma/

(npx prisma studio &)
if [ "$RUN_SERVER" = 1 ]; then
  yarn build && yarn start
else
  yarn test
  # yarn test:debug
fi
