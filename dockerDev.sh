#!/bin/bash

[ ! -f ".env" ] && cp .env.example .env
MNEMONIC=$(grep MNEMONIC .env)

[ ! -f "./nodes-media/.env" ] && cp ./nodes-media/.env.example ./nodes-media/.env
[ ! -f "../nodes-web/.env" ] && cp ../nodes-web/.env.example ../nodes-web/.env

if [ ! -f "./desci-contracts/.env" ]; then
  touch ./desci-contracts/.env
  [ ! -z "$MNEMONIC" ] && echo $MNEMONIC >> ./desci-contracts/.env
fi

if [ -z $NVM_DIR ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
fi
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
nvm install $(cat .nvmrc)
nvm use
npm i -g hardhat
npm i -g yarn

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

GANACHE_PID=$(lsof -i:8545 | grep '*:8545' | awk '{print $2}' | tail -n 1)
if [ $GANACHE_PID ]; then
    echo "killing ganache, pid=$GANACHE_PID"
    kill -9 $GANACHE_PID
fi

echo $PWD
COMPOSE_HTTP_TIMEOUT=120 docker-compose --file docker-compose.yml --file docker-compose.dev.yml --compatibility up --build
