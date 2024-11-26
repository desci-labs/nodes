#!/bin/sh

# Exit on error
set -e
ENVIRONMENT=$1
echo "Building sync server for $ENVIRONMENT"
# REPLACE <DATABASE_URL> pattern in wrangler.toml with value
# yarn cache clean --all
yarn install
if [[ "${ENVIRONMENT}" = 'test' ]]; then
    awk '{gsub("<DATABASE_URL>", "postgresql://walter:white@host.docker.internal:5434/boilerplate", $0); print}' template.toml >wrangler.toml
    yarn compile
    sed -i "" -e "s/<DATABASE_URL>/postgresql:\/\/walter:white@host.docker.internal:5434\/boilerplate/g" '.wrangler/dist/index.js'
    yarn build
else
    awk '{gsub("<DATABASE_URL>", "postgresql://walter:white@host.docker.internal:5433/boilerplate", $0); print}' template.toml >wrangler.toml
    yarn compile
    sed -i "" -e "s/<DATABASE_URL>/postgresql:\/\/walter:white@host.docker.internal:5433\/boilerplate/g" '.wrangler/dist/index.js'
    yarn build
fi
