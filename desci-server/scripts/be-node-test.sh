#!/bin/sh

set -e

yarn run migrate
npx prisma db seed

(npx prisma studio &)
if [ "$RUN_SERVER" = 1 ]; then
  yarn start
else
  yarn test
  # yarn test:debug
fi
