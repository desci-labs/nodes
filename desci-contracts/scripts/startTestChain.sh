# fake private key (junk mnemonic)
## only redeploy a new contract if 1 old entry is in the unknown-research-object.json file
## to force redeploy of fresh contract, delete 2nd entry under proxies in unknown-research-object.json file
yarn stubHardhatAnalytics
echo "checking if contract upgrade required..."
SHOULD_UPGRADE=0
if [ [ ! -f ".openzeppelin/unknown-upgrade.json" ] && [ -f ".openzeppelin/unknown-1337.json" ] ]; then
    echo "migrating RO contract config"
    SHOULD_UPGRADE=1
    touch .openzeppelin/unknown-upgrade.json
fi
echo "SHOULD_UPGRADE=$SHOULD_UPGRADE"
(echo "waiting for ganache..." && sleep 10 && (scripts/checkTestDeployments.sh ".openzeppelin/unknown-dpid.json" && yarn deploy:dpid:ganache) ; sleep 10 && (scripts/checkTestDeployments.sh ".openzeppelin/unknown-research-object.json" && yarn deploy:ganache) ; sleep 10 && ( [ $SHOULD_UPGRADE = 1 ] && yarn upgrade:local ) ) &
(echo "deploy subgraph..." && sleep 30 && scripts/deployLocalSubgraph.sh ) &
npx ganache-cli -i 1111 --quiet -h 0.0.0.0 --mnemonic "${MNEMONIC}" --db /data
