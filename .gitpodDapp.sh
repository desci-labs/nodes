#!/bin/bash
cd desci-dapp ; yarn

while [ 1 ]; do
    if test -f "../desci-contracts/.openzeppelin/research-object-1337.json"; then
        echo "found!"
        yarn
        yarn start
        exit 0
    else
        echo "checking for contract before starting frontend"
        sleep 1
    fi
done

