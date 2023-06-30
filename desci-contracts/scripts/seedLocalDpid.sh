FILE=.openzeppelin/unknown-dpid.json
MNEMONIC=$(grep MNEMONIC .env | cut -d '=' -f 2-)
RUNNING=true
function check() {
    FILE=.openzeppelin/unknown-dpid.json

    while $RUNNING; do
        test $? -gt 128 && break;
        echo "[seedLocalDpid] checking"
        # if deployment file doesnt exist, we need to deploy
        if [ -f "$FILE" ]; then
            echo "[seedLocalDpid] killing"
            ((ps aux | grep  "npm exec ganache" | grep -v grep | awk '{print $2}' | xargs kill) && echo "done") || echo "[seedLocalDpid]  ganache wasn't running when we tried to stop the process"
            exit
        fi
        sleep 5
    done
}

_term() { 
  echo "[seedLocalDpid] Caught signal!"
  RUNNING=false
  kill -s SIGTERM $child
  exit 130
}

trap _term SIGTERM SIGINT 

echo "[seedLocalDpid] checking if ABI seed needed for DPID Registry"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "[seedLocalDpid] found DPID Registry deployment file"
else
    echo "[seedLocalDpid] no DPID Registry deployment file, running local ganache and deploying"
    (echo "[seedLocalDpid] waiting for ganache..." && sleep 10 && MNEMONIC="$MNEMONIC" yarn deploy:dpid:ganache ) &
    mkdir -p ../local-data/ganache
    echo "[seedLocalDpid] sudo needed only first time to deploy contract"
    sudo chown -R $(whoami) ../local-data/ganache
    (echo "[seedLocalDpid] sleeping until contract deployed" && check ) &
    child=$!
    if [[ -z $NO_GANACHE ]]; then
        npx ganache --server.host="0.0.0.0" --database.dbPath="../local-data/ganache" --chain.networkId="1337" --wallet.mnemonic="${MNEMONIC}" --logging.quiet="true"
    else
        echo "[seedLocalDpid] skipping ganache"
    fi
    wait "$child"
fi
