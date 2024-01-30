#! /usr/bin/env bash

set -euo pipefail

# Send output to stderr
echoerr() {
  echo "$@" 1>&2;
}

TEMPLATE_FILE=$1
if [[ -z "$TEMPLATE_FILE" ]]; then
  echoerr "Template file not passed as first argument, exiting."
  exit 1
fi

# Get all variables needing substitution
TEMPLATE_VARS=$(grep --only-matching "@.*@" "$TEMPLATE_FILE" | tr --delete "@")

# Check that each template var exists in env
while read -r templateVar; do
  if ! printenv "$templateVar" &>/dev/null; then
    echoerr "$templateVar is not set in environment, exiting."
    exit 1
  fi
done <<<"$TEMPLATE_VARS"


# For each line in the template file
while read -r line; do
  # If we got a variable in the line...
  if var=$(grep --only-matching "@.*@" <<<"$line" | tr --delete "@"); then
    # ...replace it with the env variable
    sed "s/@$var@/$(printenv "$var")/" <<<"$line"
  else
    # ...else just re-print the line
    echo "$line"
  fi
done < "$TEMPLATE_FILE"
