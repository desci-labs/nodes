#!/bin/bash
[ ! -f "~/.local/share/hardhat-nodejs/analytics.json" ] && echo "{\"analytics\": {\"clientId\": \"47c226ca-85f1-4b1d-8e2e-bd9886703144\"}}" > ~/.local/share/hardhat-nodejs/analytics.json
echo "done"