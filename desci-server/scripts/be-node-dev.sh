#!/bin/sh
echo "Install bash and execute 'wait-for-it.sh' script"
apt-get add --update bash
apt-get update
apt-get install -y postgresql-client

./desci-server/scripts/wait-for-it.sh $PG_HOST:5432 --timeout=5 --strict -- echo "postgres up and running"

waitForPostgres() {
    pg_uri="postgres://walter:white@host.docker.internal:5433/boilerplate"
    # make sure pg is ready to accept connections
    until pg_isready -h host.docker.internal -p 5433 -U walter; do
        echo "Waiting for postgres at: $pg_uri"
        sleep 5
    done
    # Now able to connect to postgres
}

# npm run migration:run
# npm run seed:run
chmod -R 777 /app/node_modules/.prisma
chmod -R 777 /app/node_modules/prisma
chmod -R 777 /root/ && chown node:node /root/.cache/prisma/master/2920a97877e12e055c1333079b8d19cee7f33826/debian-openssl-1.1.x/libquery-engine # for prisma studio
cd desci-server
waitForPostgres
yarn run migrate
npx prisma db seed
(npx prisma studio&)
yarn dev