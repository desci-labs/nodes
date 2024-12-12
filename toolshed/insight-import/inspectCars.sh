#! /bin/env bash

find local-data -name '*.car' \
  -exec echo \; \
  -exec echo "🔎 {}" \; \
  -exec car inspect {} \;
