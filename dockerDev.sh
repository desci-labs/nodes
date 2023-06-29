#! /usr/bin/env bash

# Sane error handling
# add -x to debug command flow
set -euo pipefail
trap catch ERR
catch() {
  echo "[dockerDev] script failed! Containers may still be running."
  exit 1
}

assert_command_available() {
  local cmd_to_check=$1
  if ! command -v "$cmd_to_check" &> /dev/null
  then
    echo "[dockerDev] Script dependency '$cmd_to_check' is not installed, aborting"
    exit 1
  fi
}

init_node() {
  if [ -z "$NVM_DIR" ]; then
    echo "[dockerDev] NVM_DIR not set, please install NVM"
    echo "[dockerDev] curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash"
    exit 1
  fi

  # Since nvm is loaded through shell config, it's not available
  # in scripts unless we source it manually
  local NVM_SCRIPT="$NVM_DIR/nvm.sh"
  if [[ -s "$NVM_SCRIPT" ]]
  then
    source "$NVM_SCRIPT"
  else
    echo "[dockerDev] Could not find $NVM_SCRIPT, aborting"
    exit 1
  fi
  nvm install $(cat .nvmrc)
  nvm use
}

# Check prerequisites
assert_command_available "docker"
assert_command_available "docker-compose"
assert_command_available "lsof"

init_node
npm i -g hardhat
npm i -g yarn

# Let's build!
echo "[dockerDev] building project..."
make

echo "[dockerDev:desci-contracts] starting seed of local chain..."
make -C desci-contracts seed

# Quite sure this never happens, delete? :thinking:
set +o pipefail
GANACHE_PID=$(lsof -i:8545 | grep '*:8545' | awk '{print $2}' | tail -n 1)
set -o pipefail
if [ "$GANACHE_PID" ]; then
    echo "[dockerDev] killing ganache, pid=$GANACHE_PID"
    kill -9 "$GANACHE_PID"
else
  echo "[dockerDev] couldn't find ganache PID to kill, skipping"
fi

# Default to empty if unset
ADDITIONAL_FLAGS=${ADDITIONAL_FLAGS:-""}
echo "[dockerDev] PWD=$PWD"
COMPOSE_HTTP_TIMEOUT=120 docker-compose \
  --project-name desci \
  --file docker-compose.yml \
  --file docker-compose.dev.yml \
  $ADDITIONAL_FLAGS \
  --compatibility \
  up \
  --build
