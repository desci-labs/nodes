FROM ceramicnetwork/js-ceramic:3.2.0

COPY interpolateConfigVars.sh .
COPY .ceramicTemplate.config.json .

ENTRYPOINT [ \
  "bash", "-c", \
  "./interpolateConfigVars.sh .ceramicTemplate.config.json | jq > daemon.config.json && ./packages/cli/bin/ceramic.js daemon --config daemon.config.json" \
]
