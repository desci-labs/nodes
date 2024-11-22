#! /usr/bin/env bash

# Sane error handling
# add -x to debug command flow
set -euo pipefail
trap catch ERR
catch() {
  echo "[dockerDev] script exited"
  exit 1
}

assert_command_available() {
  local cmd_to_check=$1
  if ! command -v "$cmd_to_check" &>/dev/null; then
    echo "[dockerDev] Script dependency '$cmd_to_check' is not installed, aborting"
    exit 1
  fi
}

init_node() {
  if ! printenv NVM_DIR &> /dev/null && ! command -v fnm; then
    echo "[dockerDev] NVM_DIR not set, please install NVM"
    echo "[dockerDev] curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash"
    exit 1
  fi

  # Since nvm is loaded through shell config, it's not available
  # in scripts unless we source it manually
  local NVM_SCRIPT="${NVM_DIR-}/nvm.sh"
  if command -v fnm &>/dev/null; then
    # A script doesn't inherit get aliases, so if fnm is available, "implement" nvm with that
    nvm() { fnm "$@"; }
  elif [ -s "$NVM_SCRIPT" ]; then
    # shellcheck disable=SC1090
    source "$NVM_SCRIPT"
  else
    echo "[dockerDev] Could not find $NVM_SCRIPT, aborting"
    exit 1
  fi

  nvm install "$(cat .nvmrc)"
  nvm use
}

# Check prerequisites
assert_command_available "docker"
assert_command_available "docker-compose"
assert_command_available "lsof"
assert_command_available "make"
assert_command_available "curl"

init_node
npm i -g hardhat
npm i -g yarn

# Let's build!
echo "[dockerDev] building project..."
make

echo "[dockerDev:desci-contracts] starting seed of local chain..."
make -C desci-contracts seed

echo "compile sync server worker binary"
make -C sync-server build

# compose will initialise non-existing volume directories with root permissions
echo "[dockerDev] initialising docker volume directories..."
for volDir in $(grep -o "local-data/[a-z_]*" docker-compose.dev.yml); do
  mkdir -p "$volDir"
done

# Start the ceramic service and it's dependencies to deploy models, before
# kicking off the rest of the cluster
./bootstrapCeramic.sh

# Default to empty if unset
ADDITIONAL_FLAGS=${ADDITIONAL_FLAGS:-""}
echo "[dockerDev] PWD=$PWD"
COMPOSE_HTTP_TIMEOUT=320 docker compose \
  --project-name desci \
  --file docker-compose.yml \
  --file docker-compose.dev.yml \
  --file docker-compose.repo.yml \
  --file docker-compose.sync.yml \
  $ADDITIONAL_FLAGS \
  --compatibility \
  up \
  --build
