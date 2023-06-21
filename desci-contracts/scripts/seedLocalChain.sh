FILE=.openzeppelin/unknown-research-object.json
MNEMONIC=$(grep MNEMONIC .env | cut -d '=' -f 2-)
echo "[seedLocalChain] GOT MNEMONIC $MNEMONIC"
RUNNING=true
function check() {
    FILE=.openzeppelin/unknown-research-object.json

    while $RUNNING; do
        test $? -gt 128 && break;
        echo "[seedLocalChain] checking"
        # if deployment file doesnt exist, we need to deploy
        if [ -f "$FILE" ]; then
            echo "[seedLocalChain] killing ganache..."
            (
              (
                ps aux | grep  "npm exec ganache" | grep -v grep | awk '{print $2}' | xargs kill
              ) && echo "done"
            ) || echo "[seedLocalChain] ganache wasn't running when we tried to stop the process"
            exit
        fi
        sleep 5
    done
}

_term() { 
  echo "Caught signal!"
  RUNNING=false
  kill -s SIGTERM $child
  exit 130
}

trap _term SIGTERM SIGINT 

echo "[seedLocalChain] checking if ResearchObject ABI seed needed"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "[seedLocalChain] found ResearchObject deployment file"
else
    echo "[seedLocalChain] no ResearchObject deployment file, running local ganache and deploying"
    (echo "[seedLocalChain] waiting for ganache..." && sleep 10 && MNEMONIC="$MNEMONIC" yarn deploy:ganache ) &
    mkdir -p ../local-data/ganache
    echo "[seedLocalChain] sudo needed only first time to deploy contract"
    sudo chown -R $(whoami) ../local-data/ganache
    (echo "[seedLocalChain] sleeping until contract deployed" && check ) &
    child=$!
    if [[ -z $NO_GANACHE ]]; then
        npx ganache --server.host="0.0.0.0" --database.dbPath="../local-data/ganache" --chain.networkId="111" --wallet.mnemonic="${MNEMONIC}" --logging.quiet="true"
    else
        echo "[seedLocalChain] skipping ganache"
    fi
    wait "$child"
fi

