#!/bin/bash

# Sane error handling
# add -x to debug command flow
set -euo pipefail

function assert_command_available {
  cmd_to_check=$1
  if ! command -v "$cmd_to_check" &> /dev/null
  then
    echo "[dockerDev] Script dependency '$cmd_to_check' is not installed, aborting"
    exit 1
  fi
}

# Make sure implicit dependencies are available
assert_command_available "docker"
assert_command_available "docker-compose"
assert_command_available "lsof"

[ ! -f ".env" ] && cp .env.example .env
if ! grep MNEMONIC .env &> /dev/null; then
  echo "[dockerDev] ERROR: set MNEMONIC in .env"
  exit 1
fi
MNEMONIC=$(grep MNEMONIC .env)

[ ! -f "./nodes-media/.env" ] && cp ./nodes-media/.env.example ./nodes-media/.env
[ ! -f "../nodes-web/.env" ] && cp ../nodes-web/.env.example ../nodes-web/.env

if [ ! -f "./desci-contracts/.env" ]; then
  touch ./desci-contracts/.env
  [ ! -z "$MNEMONIC" ] && echo $MNEMONIC >> ./desci-contracts/.env
fi

if [ -z $NVM_DIR ]; then
    echo "[dockerDev] NVM_DIR not set, please install NVM"
    echo "[dockerDev] curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash"
    exit 1
fi

# Since nvm is loaded through shell config, it's not available
# in scripts unless we source it manually
NVM_SCRIPT="$NVM_DIR/nvm.sh"
if [[ -s "$NVM_SCRIPT" ]]
then
  source "$NVM_SCRIPT"
else
  echo "[dockerDev] Could not find $NVM_SCRIPT, aborting"
  exit 1
fi

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

set +o pipefail
GANACHE_PID=$(lsof -i:8545 | grep '*:8545' | awk '{print $2}' | tail -n 1)
set -o pipefail
if [ $GANACHE_PID ]; then
    echo "[dockerDev] killing ganache, pid=$GANACHE_PID"
    kill -9 $GANACHE_PID
fi

# Use ADDITIONAL_FLAGS if provided, otherwise default empty
ADDITIONAL_FLAGS=${ADDITIONAL_FLAGS:-""}
echo $PWD
COMPOSE_HTTP_TIMEOUT=120 docker-compose --file docker-compose.yml --file docker-compose.dev.yml $ADDITIONAL_FLAGS --compatibility up --build
