# fake private key (junk mnemonic)
## only redeploy a new contract if 1 old entry is in the unknown-research-object.json file
## to force redeploy of fresh contract, delete 2nd entry under proxies in unknown-research-object.json file
yarn stubHardhatAnalytics
echo "[startTestChain] checking if contract upgrade required..."
SHOULD_UPGRADE=0
if [ ! -f ".openzeppelin/unknown-upgrade.json" ] && [ -f ".openzeppelin/unknown-1337.json" ]; then
    echo "[startTestChain] migrating RO contract config"
    SHOULD_UPGRADE=1
    touch .openzeppelin/unknown-upgrade.json
fi
echo "[startTestChain] SHOULD_UPGRADE=$SHOULD_UPGRADE"
(echo "[startTestChain] waiting for ganache..." && sleep 10 && (NO_GANACHE=1 scripts/checkTestDeployments.sh ".openzeppelin/unknown-dpid.json" && yarn deploy:dpid:ganache) ; sleep 10 && (scripts/checkTestDeployments.sh ".openzeppelin/unknown-research-object.json" && yarn deploy:ganache) ; sleep 10 && ( [ $SHOULD_UPGRADE = 1 ] && yarn upgrade:local ) ) &
(echo "[startTestChain] deploy subgraph..." && sleep 30 && NO_GANACHE=1 scripts/deployLocalSubgraph.sh ) &
npx ganache --server.host="0.0.0.0"  --chain.networkId="111" --wallet.mnemonic="${MNEMONIC}" --logging.quiet="true" --database.dbPath="/data"
