#!/bin/sh
echo "Install bash and execute 'wait-for-it.sh' script"
apt-get install bash

# Exit on error
set -e
./desci-server/scripts/wait-for-it.sh $PG_HOST:$PG_PORT --timeout=5 --strict -- echo "postgres up and running"

# npm run migration:run
# npm run seed:run
chmod -R 777 /app/node_modules/.prisma
chmod -R 777 /app/node_modules/prisma
# chmod -R 777 /root/ && chown node:node /root/.cache/prisma/master/2920a97877e12e055c1333079b8d19cee7f33826/debian-openssl-1.1.x/libquery-engine # for prisma studio
cd desci-server
yarn run migrate
npx prisma db seed

npm run script:seed-social-data

# import required images from ipfs to local
chmod +x ./scripts/import-ipfs-content.sh
./scripts/import-ipfs-content.sh

# note: for local dev, you can probably import dpid 46 using the following script, however it doesn't work due to local IPFS client not being open to the public (swarm key)
# when you set NODE_ENV=prod, it uses the public IPFS reader. Need to adjust this for local dev so we can properly import in the future
# NODE_ENV=prod OPERATION=fillPublic USER_EMAIL=noreply@desci.com NODE_UUID=pOV6-0ZN8k8Nlb3iJ7BHgbHt4V_xt-H-dUbRQCLKl78. npm run script:fix-data-refs
(npx prisma studio &)
yarn dev
