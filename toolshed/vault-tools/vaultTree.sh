#! /usr/bin/env bash

set -euo pipefail

usage() {
    echo "Usage: $0 [-m <mount-path>] [-t <vault-token>] [-a <vault-addr>]"
    echo
    echo "Options:"
    echo "  -m  Mount path to start search from (default: search all mounts)"
    echo "  -s  Show secret values in output (default: false)"
    echo "  -t  Vault token (defaults to VAULT_TOKEN env variable)"
    echo "  -a  Vault address (defaults to VAULT_ADDR env variable)"
    echo "  -h  Show this help message"
    exit 1
}

# Set initial path to list
MOUNT_PATH="secrets"
SHOW_SECRETS=false

# Parse command line arguments
while getopts "m:s:t:a:h" opt; do
    case $opt in
        m) MOUNT_PATH="$OPTARG" ;;
        s) SHOW_SECRETS=true ;;
        t) export VAULT_TOKEN="$OPTARG" ;;
        a) export VAULT_ADDR="$OPTARG" ;;
        h) usage ;;
        \?) usage ;;
    esac
done

function list_secrets() {
  local path=$1
  local prefix=$2
  local dirs
  
  if dirs=$(vault kv list -format=json "$path" | jq -r '.[]'); then
    echo "$dirs" | while read -r dir; do
      # Remove trailing slash to prevent double slashes
      local dir=${dir%/}

      # Print directory entry
      echo "${prefix}|- ${dir}"

      local next_path="${path}/${dir}"
      # Recursively process subdirectory
      list_secrets "$next_path" "${prefix}|  "
    done
  else
    # This path is a leaf, get the secret keys
    local entries
    entries=$(vault kv get -format=json "$path" | jq -r '.data | to_entries[] | "\(.key)=\(.value)"')

    # Display keys
    echo "$entries" | while read -r entry; do
      local data
      data=$(if $SHOW_SECRETS; then echo "$entry"; else echo "$entry" | sed 's|=.*||'; fi)
      echo "${prefix}|- $data"
    done
  fi
}

echo "$MOUNT_PATH/"
list_secrets "$MOUNT_PATH" ""
