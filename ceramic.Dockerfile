FROM ceramicnetwork/js-ceramic:3.2.0

ENTRYPOINT echo $CERAMIC_CONFIG > daemon.config.json && ./packages/cli/bin/ceramic.js daemon --config daemon.config.json
