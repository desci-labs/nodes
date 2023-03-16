FILE=.openzeppelin/unknown-dpid.json

RUNNING=true
function check() {
    FILE=.openzeppelin/unknown-dpid.json

    while $RUNNING; do
        test $? -gt 128 && break;
        echo "checking"
        # if deployment file doesnt exist, we need to deploy
        if [ -f "$FILE" ]; then
            echo "killing"
            killall "npm exec ganache-cli" || ((ps aux | grep  "npm exec ganache-cli" | grep -v grep | awk '{print $2}' | xargs kill) && echo "done")
            exit 1
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

echo "checking if ABI seed needed for DPID Registry"
# if deployment file doesnt exist, we need to deploy
if [ -f "$FILE" ]; then
    echo "found DPID Registry deployment file"
else
    echo "no DPID Registry deployment file, running local ganache and deploying"
    (echo "waiting for ganache..." && sleep 10 && PRIVATE_KEY="1234567812345678123456781234567812345678123456781234567812345678" yarn deploy:dpid:ganache ) &
    mkdir -p ../local-data/ganache
    echo "sudo needed only first time to deploy contract"
    sudo chown -R $(whoami) ../local-data/ganache
    (echo "sleeping until contract deployed" && check ) &
    child=$!
    npx ganache-cli -i 1111 --quiet -h 0.0.0.0 --mnemonic "test test test test test test test test test test test junk" --db ../local-data/ganache
    wait "$child"
fi

