#!/bin/bash

[ ! -f ".env" ] && cp .env.example .env
[ ! -f "./nodes-media/.env" ] && cp ./nodes-media/.env.example ./nodes-media/.env
[ ! -f "../nodes-web/.env" ] && cp ../nodes-web/.env.example ../nodes-web/.env

if [ -d "desci-contracts" ]; then
    cd desci-contracts
    yarn
    scripts/seedLocalDpid.sh
    scripts/seedLocalChain.sh
fi
if [ -d "../desci-contracts" ]; then
    cd ../desci-contracts
    yarn
    scripts/seedLocalDpid.sh
    scripts/seedLocalChain.sh
    cd ..
fi

if [ -d "desci-server" ]; then
    cd desci-server
    cd ..
fi

echo $PWD
COMPOSE_HTTP_TIMEOUT=120 docker-compose --file docker-compose.yml --file docker-compose.dev.yml --compatibility up --build