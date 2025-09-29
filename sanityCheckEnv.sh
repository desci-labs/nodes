#! /usr/bin/env bash

R_VAR='^(# +)?[A-Z0-9_]+='
RED='\033[0;31m'
GREEN='\033[0;32m'
PLAIN='\033[0m'

getVars () {
  local envFile=$1

  # Get raw var, inc possible comment and trailing equal sign
  raw=$(grep -oE "$R_VAR" "$envFile")
  # Uncomment
  uncommented=$(sed 's/# *//' <(echo "$raw"))
  # Un-equals
  plain=$(sed 's/=//' <(echo "$uncommented"))
  # Sort and remove duplicates
  tidy=$(sort <(echo "$plain") | uniq)
  echo -n "$tidy"
}

# Get all vars, commented or not
TEAM_VARS=$(getVars .env.example)
YOUR_VARS=$(getVars .env)


if diff -q <(echo "$TEAM_VARS") <(echo "$YOUR_VARS") > /dev/null; then
  exit 0
fi

echo "[sanityCheckEnv.sh] found potential env spook! A happy engineer fixes this delta ASAP."
echo

echo "[sanityCheckEnv.sh] variables only in your .env:"
echo -en "$RED"
comm -13 <(echo "$TEAM_VARS") <(echo "$YOUR_VARS")
echo -e "$PLAIN"

echo "[sanityCheckEnv.sh] variables only in .env.example:"
echo -en "$GREEN"
comm -23 <(echo "$TEAM_VARS") <(echo "$YOUR_VARS")
echo -en "$PLAIN"
